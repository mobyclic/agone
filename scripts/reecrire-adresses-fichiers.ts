/**
 * Réécrit les adresses des fichiers stockées en base, d'une racine à une autre :
 * R2 (https://pub-….r2.dev) → fichiers servis par l'appli (https://<site>/fichiers).
 *
 *   bun run scripts/reecrire-adresses-fichiers.ts --vers https://agone.dev.mobyclic.com/fichiers [--de <racine>] [--ecrire]
 *
 * Sans --de : toutes les racines r2.dev trouvées. Sans --ecrire : simple inventaire.
 * Rejouable (à la bascule : --de https://agone.dev.mobyclic.com/fichiers --vers https://agone.org/fichiers).
 * Parcourt TOUTES les tables. Ne réécrit que les champs texte de premier niveau (aujourd'hui
 * `media.url`) ; une adresse trouvée plus profond (objet, tableau, HTML) est signalée et arrête tout.
 * Refuse la base Surreal Cloud : Railway s'en sert encore.
 */
import { readFileSync } from 'node:fs';
import { Surreal } from 'surrealdb';

for (const line of ['.env.local', '.env'].flatMap((f) => { try { return readFileSync(f, 'utf8').split('\n'); } catch { return []; } })) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const arg = (n: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const vers = arg('--vers')?.replace(/\/+$/, '');
const de = arg('--de')?.replace(/\/+$/, '');
const ecrire = process.argv.includes('--ecrire');
const e = process.env;
if (!vers) { console.error('--vers <racine> est requis.'); process.exit(1); }
if (/surreal\.cloud/.test(e.SURREAL_URL ?? '')) { console.error('SURREAL_URL vise Surreal Cloud (utilisé par Railway) : abandon.'); process.exit(1); }

const db = new Surreal();
await db.connect(e.SURREAL_URL!, { versionCheck: false });
await db.use({ namespace: e.SURREAL_NAMESPACE!, database: e.SURREAL_DATABASE! });
await db.signin(e.SURREAL_AUTH_LEVEL === 'database'
  ? { namespace: e.SURREAL_NAMESPACE!, database: e.SURREAL_DATABASE!, username: e.SURREAL_USER!, password: e.SURREAL_PASS! }
  : { username: e.SURREAL_USER!, password: e.SURREAL_PASS! });
console.log(`base : ${e.SURREAL_URL} · ${e.SURREAL_NAMESPACE}/${e.SURREAL_DATABASE}`);

// Racines à remplacer : --de, ou toutes les origines r2.dev présentes.
const motif = de ?? 'r2.dev';
const info: any = (await db.query('INFO FOR DB'))[0];
const racines = new Set<string>();
const champs = new Map<string, number>(); // « table.champ » (premier niveau, texte) → occurrences
const profonds: string[] = [];
for (const t of Object.keys(info.tables ?? {})) {
  const rows: any[] = ((await db.query(`SELECT * FROM type::table($t) WHERE string::contains(<string> $this, $m)`, { t, m: motif })) as any[])[0] ?? [];
  for (const r of rows) for (const [k, v] of Object.entries(r)) {
    if (typeof v === 'string') {
      if (!v.includes(motif)) continue;
      champs.set(`${t}.${k}`, (champs.get(`${t}.${k}`) ?? 0) + 1);
      if (de) racines.add(de); else { try { racines.add(new URL(v).origin); } catch { profonds.push(`${t}.${k} (texte non-adresse) ${String(r.id)}`); } }
    } else if (v && typeof v === 'object' && JSON.stringify(v).includes(motif)) profonds.push(`${t}.${k} ${String(r.id)}`);
  }
}
for (const [c, n] of champs) console.log(`  ${c} : ${n}`);
console.log(`racines : ${[...racines].join(', ') || 'aucune'} → ${vers}`);
if (profonds.length) { console.error(`Adresses hors champ texte de premier niveau (à traiter à la main) :\n  ${profonds.slice(0, 20).join('\n  ')}`); process.exit(2); }
if (!ecrire) { console.log('Inventaire seulement : relancer avec --ecrire pour réécrire.'); process.exit(0); }

for (const c of champs.keys()) {
  const [t, k] = c.split('.');
  for (const r of racines) {
    await db.query(`UPDATE type::table($t) SET ${k} = string::replace(${k}, $de, $vers) WHERE string::starts_with(${k} ?? '', $de)`, { t, de: r, vers });
  }
}
const reste: any[] = ((await db.query(`SELECT count() AS n FROM media WHERE string::contains(url ?? '', $m) GROUP ALL`, { m: motif })) as any[])[0] ?? [];
console.log(`réécrit. Reste dans media.url : ${reste[0]?.n ?? 0}`);
await db.close();
