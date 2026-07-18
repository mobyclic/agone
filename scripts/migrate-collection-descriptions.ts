/**
 * Rapatrie les descriptions des collections depuis WordPress (taxonomie `collection`).
 * Le dump initial n'incluait pas la description des termes : ce script la récupère
 * dans wp_term_taxonomy.description et met à jour collection.description par legacy_term_id.
 * WordPress = LECTURE SEULE (SELECT). N'écrit que dans Surreal. Idempotent.
 */
import { readFileSync } from 'node:fs';
import { Surreal } from 'surrealdb';
import mysql from 'mysql2/promise';

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const E = process.env;
const prefix = E.WP_DB_PREFIX || 'wri_';

const wp = await mysql.createConnection({
  host: E.WP_DB_HOST, port: Number(E.WP_DB_PORT || 3306),
  user: E.WP_DB_USER, password: E.WP_DB_PASS, database: E.WP_DB_NAME,
  charset: 'utf8mb4_unicode_ci'
});
const [terms] = await wp.query<any[]>(
  `SELECT t.term_id AS term_id, t.name AS name, tt.description AS description
     FROM ${prefix}term_taxonomy tt
     JOIN ${prefix}terms t ON t.term_id = tt.term_id
    WHERE tt.taxonomy = 'collection'`
);
await wp.end();

const db = new Surreal();
await db.connect(E.SURREAL_URL!, { versionCheck: false });
await db.use({ namespace: E.SURREAL_NAMESPACE!, database: E.SURREAL_DATABASE! });
await db.signin({ username: E.SURREAL_USER!, password: E.SURREAL_PASS! });

let updated = 0;
for (const t of terms) {
  const desc = String(t.description ?? '').trim();
  if (!desc) { console.log(`  ${t.name} (${t.term_id}) → vide, ignoré`); continue; }
  const res = await db.query<[any[]]>(
    `UPDATE collection SET description = $d WHERE legacy_term_id = $tid RETURN meta::id(id) AS id`,
    { d: desc, tid: Number(t.term_id) }
  );
  const n = (res[0] as any[])?.length ?? 0;
  if (n) updated++;
  console.log(`  ${t.name} (${t.term_id}) → ${desc.length} car. → ${n ? 'mise à jour' : 'aucune collection appariée'}`);
}
console.log(`\n✓ ${updated} description(s) de collection mise(s) à jour.`);
await db.close();
process.exit(0);
