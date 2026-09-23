/**
 * Portraits d'auteurs depuis Wikimedia Commons (via Wikidata).
 *
 *   bun run portraits                 # propose, n'écrit rien : rapport à relire
 *   bun run portraits --appliquer     # enregistre les portraits CORROBORÉS seulement
 *   bun run portraits --appliquer --tous   # enregistre aussi les candidats non corroborés
 *   bun run portraits --slug=noam-chomsky  # se limite à un auteur (test)
 *   bun run portraits --limite=50          # s'arrête après N auteurs examinés
 *
 * Pourquoi Wikimedia et rien d'autre : une photo de presse trouvée « sur le web »
 * appartient à un photographe ou à une agence, et la publier sur le site d'un
 * éditeur expose à un retrait ou à une facture. Commons ne contient que des
 * fichiers sous licence libre — à condition d'afficher l'auteur de la photo et
 * sa licence, ce que le script enregistre (media.credit / license / source_url)
 * et que la fiche auteur affiche.
 *
 * Le risque restant est l'HOMONYMIE : rien ne prouve qu'un élément Wikidata
 * portant le bon nom soit bien l'auteur publié par Agone. Trois garde-fous :
 *   1. l'élément est un être humain (P31 = Q5) avec une image (P18) ;
 *   2. sa profession (P106) est intellectuelle (écrivain, historien, sociologue…) ;
 *   3. CORROBORATION : sa page Wikipédia francophone cite « Agone » ou l'un des
 *      titres qu'il a publiés chez Agone.
 * Seuls les candidats corroborés sont enregistrés par défaut ; les autres sont
 * listés dans le rapport pour une vérification humaine (--tous pour les forcer).
 *
 * Périmètre : uniquement les AUTEURS de livres (arête contributed_by role=author)
 * encore sans portrait. Vise la base de .env.local s'il existe, sinon le cloud.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { Surreal, RecordId } from 'surrealdb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

for (const l of ['.env.local', '.env'].flatMap((f) => { try { return readFileSync(f, 'utf8').split('\n'); } catch { return []; } })) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const E = process.env;
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const APPLIQUER = process.argv.includes('--appliquer');
const TOUS = process.argv.includes('--tous');
const SLUG = arg('slug');
const LIMITE = Number(arg('limite') ?? 0) || 0;

// Politique d'usage des API Wikimedia : un User-Agent identifiable est exigé.
const UA = 'AgoneBot/1.0 (https://agone.org ; portraits auteurs) bun';
const json = async (url: string) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url.slice(0, 80)}`);
  return r.json() as Promise<any>;
};
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sansAccents = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();

/** Professions acceptées (Wikidata) — un homonyme footballeur est écarté. */
const METIERS = new Set([
  'Q36180',   // écrivain
  'Q11774202','Q482980', // essayiste, auteur
  'Q1930187', // journaliste
  'Q4964182', // philosophe
  'Q201788',  // historien
  'Q2306091', // sociologue
  'Q188094',  // économiste
  'Q1622272', // universitaire
  'Q4773904', // anthropologue
  'Q121594',  // professeur
  'Q82955',   // personnalité politique
  'Q6625963', // romancier
  'Q49757',   // poète
  'Q333634',  // traducteur
  'Q170790',  // mathématicien
  'Q593644',  // chimiste
  'Q901',     // scientifique
  'Q3242115', // politologue
  'Q15980158' // militant
]);

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${E.CLOUDFLARE_ACCOUNT_ID}${(E.CLOUDFLARE_R2_JURISDICTION ?? '').trim() ? `.${(E.CLOUDFLARE_R2_JURISDICTION ?? '').trim().toLowerCase()}` : ''}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: E.CLOUDFLARE_R2_ACCESS_KEY_ID!, secretAccessKey: E.CLOUDFLARE_R2_SECRET_ACCESS_KEY! }
});
const BUCKET = E.CLOUDFLARE_R2_BUCKET_NAME!;
const PUBLIC = (E.CLOUDFLARE_R2_PUBLIC_URL ?? '').replace(/\/+$/, '');

const db = new Surreal();
await db.connect(E.SURREAL_URL!, { versionCheck: false });
await db.use({ namespace: E.SURREAL_NAMESPACE!, database: E.SURREAL_DATABASE! });
await db.signin({ username: E.SURREAL_USER!, password: E.SURREAL_PASS! });
const q = async (sql: string, v?: any) => ((await db.query(sql, v)) as any[])[0];

// Auteurs de livres, sans portrait, avec leurs titres (servent à corroborer).
const auteurs: any[] = await q(
  `SELECT meta::id(id) AS id, slug, full_name, first_name, last_name,
      (SELECT VALUE in.title FROM contributed_by WHERE out = $parent.id AND role = 'author') AS titres
     FROM author
     WHERE portrait = NONE AND hidden != true
       AND count((SELECT id FROM contributed_by WHERE out = $parent.id AND role = 'author')) > 0
     ORDER BY full_name`
);
const liste = (SLUG ? auteurs.filter((a) => a.slug === SLUG) : auteurs).slice(0, LIMITE || undefined);
console.log(`Base : ${E.SURREAL_URL}`);
console.log(`→ ${liste.length} auteur(s) sans portrait à examiner${APPLIQUER ? '' : '  (proposition seule, rien ne sera écrit)'}`);

interface Candidat {
  qid: string; label: string; description?: string; fichier: string;
  credit?: string; licence?: string; page: string; corrobore: boolean; indice?: string;
}

/** Cherche l'élément Wikidata de la personne, puis son image Commons. */
async function chercher(a: any): Promise<Candidat | null> {
  const nom = String(a.full_name ?? '').trim();
  if (!nom) return null;
  const rech = await json(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=fr&uselang=fr&limit=7&type=item&search=${encodeURIComponent(nom)}`
  );
  const ids: string[] = (rech.search ?? []).map((x: any) => x.id).slice(0, 7);
  if (!ids.length) return null;

  const ent = await json(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims|labels|descriptions|sitelinks&languages=fr|en&sitefilter=frwiki&ids=${ids.join('|')}`
  );
  for (const qid of ids) {
    const e = ent.entities?.[qid];
    if (!e?.claims) continue;
    const val = (p: string) => (e.claims[p] ?? []).map((c: any) => c.mainsnak?.datavalue?.value);
    // 1. Être humain, avec une image.
    if (!val('P31').some((v: any) => v?.id === 'Q5')) continue;
    const fichier = val('P18')[0];
    if (!fichier || typeof fichier !== 'string') continue;
    // 2. Nom identique (aux accents près) et profession intellectuelle.
    const label = e.labels?.fr?.value ?? e.labels?.en?.value ?? '';
    if (sansAccents(label) !== sansAccents(nom)) continue;
    if (!val('P106').some((v: any) => METIERS.has(v?.id))) continue;

    // 3. Corroboration : la page Wikipédia FR cite Agone ou l'un de ses titres.
    let corrobore = false, indice: string | undefined;
    const page = e.sitelinks?.frwiki?.title;
    if (page) {
      try {
        const wiki = await json(
          `https://fr.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(page)}`
        );
        const texte = sansAccents(Object.values<any>(wiki.query?.pages ?? {})[0]?.extract ?? '');
        if (texte.includes('agone')) { corrobore = true; indice = 'Wikipédia cite Agone'; }
        else {
          const t = (a.titres ?? []).map(sansAccents).find((x: string) => x.length > 12 && texte.includes(x));
          if (t) { corrobore = true; indice = `Wikipédia cite « ${t} »`; }
        }
      } catch { /* page indisponible : on laisse non corroboré */ }
    }

    // Métadonnées du fichier Commons (licence + auteur de la photo).
    const info = await json(
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&titles=${encodeURIComponent(`File:${fichier}`)}`
    );
    const ii = Object.values<any>(info.query?.pages ?? {})[0]?.imageinfo?.[0];
    const meta = ii?.extmetadata ?? {};
    const nettoie = (v?: string) => {
      let t = v ? String(v).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
      // Commons duplique parfois le champ (« Unknown authorUnknown author »).
      const moitie = t.length / 2;
      if (t.length % 2 === 0 && t.slice(0, moitie) === t.slice(moitie)) t = t.slice(0, moitie);
      // « Auteur inconnu » n'est pas un crédit : la licence suffira.
      if (/^(unknown author|auteur inconnu|unknown|anonymous)$/i.test(t)) return undefined;
      return t || undefined;
    };
    return {
      qid, label, description: e.descriptions?.fr?.value ?? e.descriptions?.en?.value,
      fichier: ii?.thumburl ?? ii?.url ?? '',
      credit: nettoie(meta.Artist?.value) ?? nettoie(meta.Credit?.value),
      licence: nettoie(meta.LicenseShortName?.value),
      page: ii?.descriptionurl ?? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fichier)}`,
      corrobore, indice
    };
  }
  return null;
}

/** Télécharge, convertit en webp 600 px et enregistre le portrait. */
async function poser(a: any, c: Candidat) {
  const buf = Buffer.from(await (await fetch(c.fichier, { headers: { 'User-Agent': UA } })).arrayBuffer());
  const webp = await sharp(buf).rotate().resize({ width: 600, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  const key = `auteurs/portraits/${a.slug}.webp`;
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: webp, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' }));
  const media = (await q(`CREATE media CONTENT $m`, {
    m: {
      key, url: `${PUBLIC}/${key}`, kind: 'avatar', mime: 'image/webp', filename: `${a.slug}.webp`,
      size: webp.byteLength, alt: `Portrait de ${a.full_name}`,
      credit: c.credit, license: c.licence, source_url: c.page
    }
  }))[0];
  await q(`UPDATE $id SET portrait = $m`, { id: new RecordId('author', a.id), m: media.id });
}

const rapport: any[] = [];
let trouves = 0, corrobores = 0, poses = 0, rien = 0;
for (const [i, a] of liste.entries()) {
  if (i && i % 25 === 0) console.log(`  … ${i}/${liste.length} (candidats ${trouves}, corroborés ${corrobores})`);
  let c: Candidat | null = null;
  try { c = await chercher(a); } catch (e: any) { console.log(`  ! ${a.full_name} — ${String(e?.message ?? e).slice(0, 70)}`); }
  await pause(150); // courtoisie envers les API Wikimedia
  if (!c) { rien++; rapport.push({ auteur: a.full_name, slug: a.slug, resultat: 'aucun candidat' }); continue; }
  trouves++;
  if (c.corrobore) corrobores++;
  rapport.push({
    auteur: a.full_name, slug: a.slug, wikidata: `https://www.wikidata.org/wiki/${c.qid}`,
    description: c.description, corrobore: c.corrobore, indice: c.indice,
    photo: c.fichier, credit: c.credit, licence: c.licence, source: c.page
  });
  const marque = c.corrobore ? '✓' : '?';
  console.log(`  ${marque} ${a.full_name} — ${c.description ?? c.qid}${c.indice ? ` [${c.indice}]` : ''}`);
  if (APPLIQUER && (c.corrobore || TOUS)) {
    try { await poser(a, c); poses++; }
    catch (e: any) { console.log(`    ! dépôt impossible : ${String(e?.message ?? e).slice(0, 70)}`); }
  }
}

const fichier = `portraits-wikimedia-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(fichier, JSON.stringify(rapport, null, 1));
console.log(`\n✓ ${liste.length} auteur(s) examiné(s) : ${trouves} candidat(s), dont ${corrobores} corroboré(s) ; ${rien} sans candidat.`);
if (APPLIQUER) console.log(`  ${poses} portrait(s) enregistré(s)${TOUS ? '' : ' (corroborés seulement)'}.`);
else console.log(`  Rien n'a été écrit. Relire ${fichier}, puis relancer avec --appliquer.`);
console.log(`  Rapport : ${fichier}`);
await db.close();
process.exit(0);
