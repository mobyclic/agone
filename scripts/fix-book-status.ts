/**
 * Correctif : resynchronise book.status depuis WordPress (SOURCE DE VÉRITÉ).
 *  - WP post_status='draft'  → Surreal status='draft'  (brouillon, non public)
 *  - WP post_status='publish'→ Surreal status='published' (une date de parution
 *    future le rend automatiquement « à paraître »)
 * WordPress = LECTURE SEULE (SELECT uniquement). N'écrit que dans Surreal. Idempotent.
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

// —— WordPress (lecture seule) ——
const wp = await mysql.createConnection({
  host: E.WP_DB_HOST, port: Number(E.WP_DB_PORT || 3306),
  user: E.WP_DB_USER, password: E.WP_DB_PASS, database: E.WP_DB_NAME,
  charset: 'utf8mb4_unicode_ci', dateStrings: true
});

const [dist] = await wp.query<any[]>(
  `SELECT post_status, COUNT(*) AS n FROM ${prefix}posts WHERE post_type='livres' GROUP BY post_status`
);
console.log('Distribution WP des livres :', dist.map((r) => `${r.post_status}=${r.n}`).join(', '));

const [drafts] = await wp.query<any[]>(
  `SELECT ID FROM ${prefix}posts WHERE post_type='livres' AND post_status='draft'`
);
const [pubs] = await wp.query<any[]>(
  `SELECT ID FROM ${prefix}posts WHERE post_type='livres' AND post_status='publish'`
);
await wp.end();
const draftIds = drafts.map((r) => Number(r.ID));
const pubIds = pubs.map((r) => Number(r.ID));
console.log(`WP : ${draftIds.length} brouillons, ${pubIds.length} publiés.`);

// —— Surreal ——
const db = new Surreal();
await db.connect(E.SURREAL_URL!, { versionCheck: false });
await db.use({ namespace: E.SURREAL_NAMESPACE!, database: E.SURREAL_DATABASE! });
await db.signin({ username: E.SURREAL_USER!, password: E.SURREAL_PASS! });

// brouillons WP mal classés en published (ceux publiés par erreur)
const [wrong] = await db.query<[{ n: number }[]]>(
  `SELECT count() AS n FROM book WHERE legacy_wp_id IN $ids AND status != 'draft' GROUP ALL`,
  { ids: draftIds }
);
console.log(`À reclasser en 'draft' : ${wrong[0]?.n ?? 0}`);

await db.query(`UPDATE book SET status = 'draft' WHERE legacy_wp_id IN $ids AND status != 'draft'`, { ids: draftIds });
// filet de sécurité : livres WP publiés qui seraient restés en draft
await db.query(`UPDATE book SET status = 'published' WHERE legacy_wp_id IN $ids AND status = 'draft'`, { ids: pubIds });

// —— Vérif finale ——
const q = async (w: string) =>
  ((await db.query<[{ n: number }[]]>(`SELECT count() AS n FROM book WHERE ${w} GROUP ALL`))[0][0]?.n ?? 0);
console.log('—— état final Surreal ——');
console.log('  draft     :', await q("status = 'draft'"));
console.log('  published :', await q("status = 'published'"));
console.log('  à paraître (publié + date future) :', await q("status = 'published' AND published_at != NONE AND published_at > time::now()"));
console.log('  forthcoming résiduel (doit être 0) :', await q("status = 'forthcoming'"));

await db.close();
process.exit(0);
