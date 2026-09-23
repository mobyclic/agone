/**
 * Déménage les ebooks vers le bucket R2 PRIVÉ.
 *
 *   bun run ebooks:prive            # recopie (sans rien supprimer)
 *   bun run ebooks:prive --verifier # contrôle seulement : où est quoi, et qui est public
 *   bun run ebooks:prive --purger   # recopie PUIS supprime du bucket public (après contrôle)
 *
 * Pourquoi : le bucket principal est exposé par une URL publique (r2.dev) qui sert
 * les couvertures. Les ePub y étaient aussi : leur clé aléatoire les rendait
 * difficiles à deviner, mais une adresse qui fuite suffisait à les télécharger
 * sans les avoir achetés. Le bucket privé n'a aucun domaine public : les fichiers
 * ne sont plus servis que par /api/ebook/[id]/download, qui vérifie l'achat.
 *
 * Sûr à relancer : une clé déjà présente dans le privé n'est pas recopiée, et rien
 * n'est supprimé du public tant que la copie n'a pas été vérifiée (taille identique).
 */
import { readFileSync } from 'node:fs';
import { Surreal } from 'surrealdb';
import { S3Client, CopyObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

for (const l of ['.env.local', '.env'].flatMap((f) => { try { return readFileSync(f, 'utf8').split('\n'); } catch { return []; } })) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const E = process.env;
const VERIF = process.argv.includes('--verifier');
const PURGER = process.argv.includes('--purger');

const PUBLIC_BUCKET = E.CLOUDFLARE_R2_BUCKET_NAME!;
const PRIVE = E.CLOUDFLARE_R2_BUCKET_PRIVATE;
if (!PRIVE) throw new Error('CLOUDFLARE_R2_BUCKET_PRIVATE manquant — créez le bucket privé et renseignez la variable.');

const acc = E.CLOUDFLARE_ACCOUNT_ID!;
const jur = (E.CLOUDFLARE_R2_JURISDICTION ?? '').trim().toLowerCase();
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${jur ? `${acc}.${jur}` : acc}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: E.CLOUDFLARE_R2_ACCESS_KEY_ID!, secretAccessKey: E.CLOUDFLARE_R2_SECRET_ACCESS_KEY! }
});

const db = new Surreal();
await db.connect(E.SURREAL_URL!, { versionCheck: false });
await db.use({ namespace: E.SURREAL_NAMESPACE!, database: E.SURREAL_DATABASE! });
await db.signin({ username: E.SURREAL_USER!, password: E.SURREAL_PASS! });
const assets: any[] = ((await db.query(`SELECT r2_key, filename FROM ebook_asset`)) as any[])[0] ?? [];
console.log(`Base : ${E.SURREAL_URL}`);
console.log(`→ ${assets.length} fichier(s) ebook · public « ${PUBLIC_BUCKET} » → privé « ${PRIVE} »`);

const taille = async (Bucket: string, Key: string): Promise<number | null> => {
  try { return (await s3.send(new HeadObjectCommand({ Bucket, Key }))).ContentLength ?? 0; }
  catch { return null; }
};

let copies = 0, dejaLa = 0, absents = 0, purges = 0, publics = 0;
// Une copie par seconde environ : sans repère, on ne sait pas si ça avance.
const debut = Date.now();
let traites = 0;
const avancement = () => {
  const s = Math.max(1, Math.round((Date.now() - debut) / 1000));
  const reste = Math.round((assets.length - traites) / (traites / s));
  console.log(`  … ${traites}/${assets.length} (${copies} copié(s), ${dejaLa} déjà là) — ${s}s écoulées, ~${reste}s restantes`);
};
for (const a of assets) {
  traites++;
  if (traites % 25 === 0) avancement();
  const key = String(a.r2_key ?? '');
  if (!key) continue;
  const [dansPrive, dansPublic] = await Promise.all([taille(PRIVE, key), taille(PUBLIC_BUCKET, key)]);

  if (VERIF) {
    if (dansPublic != null) publics++;
    console.log(`  ${dansPrive != null ? '✓ privé' : '· absent du privé'}${dansPublic != null ? ' · ENCORE PUBLIC' : ''}  ${a.filename ?? key}`);
    continue;
  }

  if (dansPrive == null) {
    if (dansPublic == null) { absents++; console.log(`  ! introuvable des deux côtés : ${a.filename ?? key}`); continue; }
    await s3.send(new CopyObjectCommand({ Bucket: PRIVE, Key: key, CopySource: `${PUBLIC_BUCKET}/${key}` }));
    copies++;
  } else dejaLa++;

  if (PURGER && dansPublic != null) {
    // On ne supprime qu'après avoir constaté une copie de même taille.
    const verif = await taille(PRIVE, key);
    if (verif != null && verif === dansPublic) {
      await s3.send(new DeleteObjectCommand({ Bucket: PUBLIC_BUCKET, Key: key }));
      purges++;
    } else {
      console.log(`  ! copie douteuse, non purgée : ${a.filename ?? key} (${dansPublic} → ${verif})`);
    }
  }
}

if (!VERIF && traites % 25 !== 0) avancement();
if (VERIF) console.log(`✓ Contrôle terminé — ${publics} fichier(s) encore dans le bucket public.`);
else console.log(`✓ ${copies} copié(s), ${dejaLa} déjà dans le privé, ${absents} introuvable(s)${PURGER ? `, ${purges} supprimé(s) du public` : ''}.`);
if (!VERIF && !PURGER) console.log('  (rien n’a été supprimé — relancer avec --purger une fois le contrôle fait)');
await db.close();
process.exit(0);
