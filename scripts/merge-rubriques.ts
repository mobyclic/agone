/**
 * Fusion de rubriques Antichambre (idempotent).
 *
 *   bun run scripts/merge-rubriques.ts [--apply]
 *
 * Sans `--apply` : simulation (aucune écriture). Avec : réaffecte les articles
 * des rubriques sources vers la cible, renomme la cible, supprime les sources.
 *
 * Le slug de la cible est VOLONTAIREMENT conservé : il sert d'URL publique
 * (/antichambre?rubrique=<slug>), le renommer casserait les liens existants.
 *
 * Une sauvegarde { article → rubrique d'origine } est écrite avant toute
 * modification, pour pouvoir revenir en arrière.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Surreal, RecordId } from 'surrealdb';

// .env.local d'abord : s'il existe (base SurrealDB locale, cf. scripts/surreal-local.sh),
// ses valeurs l'emportent — la boucle ne remplit une variable que si elle est vide.
for (const line of ['.env.local', '.env'].flatMap((f) => { try { return readFileSync(f, 'utf8').split('\n'); } catch { return []; } })) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const SOURCES = ['imperialismes', 'revolution-sociale-ou-barbarie'];
const TARGET = 'inactualites';
const TARGET_NAME = 'Inactualités politiques';

const apply = process.argv.includes('--apply');

const db = new Surreal();
await db.connect(process.env.SURREAL_URL!, { versionCheck: false });
await db.use({ namespace: process.env.SURREAL_NAMESPACE!, database: process.env.SURREAL_DATABASE! });
await db.signin({ username: process.env.SURREAL_USER!, password: process.env.SURREAL_PASS! });

const one = async <T>(sql: string, vars?: Record<string, unknown>): Promise<T[]> =>
  ((await db.query(sql, vars)) as any[])[0] ?? [];

const [target] = await one<any>('SELECT id, meta::id(id) AS pid, name FROM rubrique WHERE slug = $s', { s: TARGET });
if (!target) throw new Error(`Rubrique cible « ${TARGET} » introuvable.`);

let moved = 0;
const backup: { article: string; from: string }[] = [];

const absorbed: number[] = [];

for (const slug of SOURCES) {
  const [src] = await one<any>('SELECT id, meta::id(id) AS pid, name, legacy_term_id FROM rubrique WHERE slug = $s', { s: slug });
  if (!src) { console.log(`· ${slug} : déjà fusionnée (absente)`); continue; }
  const arts = await one<any>('SELECT meta::id(id) AS pid FROM article WHERE rubrique = $r', { r: src.id });
  console.log(`· ${src.name} → ${target.name} : ${arts.length} article(s)`);
  for (const a of arts) backup.push({ article: a.pid, from: slug });
  if (src.legacy_term_id != null) absorbed.push(Number(src.legacy_term_id));
  moved += arts.length;
  if (apply) {
    await db.query('UPDATE article SET rubrique = $t WHERE rubrique = $r', { t: target.id, r: src.id });
    await db.query('DELETE $r', { r: src.id });
  }
}

// La cible hérite des term_id WordPress absorbés : sans ça, la synchronisation
// pré-production ne retrouverait plus la rubrique de ces articles.
if (apply && absorbed.length) {
  await db.query('UPDATE $r SET legacy_term_ids = array::distinct(array::concat(legacy_term_ids ?? [], $ids))',
    { r: target.id, ids: absorbed });
}

if (apply) {
  if (backup.length) {
    const f = `scripts/.merge-rubriques-backup-${Date.now()}.json`;
    writeFileSync(f, JSON.stringify(backup, null, 2));
    console.log(`↩︎  sauvegarde : ${f}`);
  }
  await db.query('UPDATE $r SET name = $n', { r: target.id, n: TARGET_NAME });
}

const [after] = await one<any>('SELECT name, slug, legacy_term_id, legacy_term_ids FROM rubrique WHERE slug = $s', { s: TARGET });
const total = await one<any>('SELECT count() FROM article WHERE rubrique = $r GROUP ALL', { r: target.id });
console.log(`${apply ? '✔' : '(simulation)'} « ${after?.name} » [${after?.slug}] — ${(total as any)[0]?.count ?? 0} articles · ${moved} déplacé(s)`);
console.log(`   term_id WordPress couverts : ${after?.legacy_term_id} + alias [${(after?.legacy_term_ids ?? []).join(', ')}]`);
if (!apply) console.log('→ relancer avec --apply pour écrire.');

await db.close();
