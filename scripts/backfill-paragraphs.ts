/**
 * Backfill one-shot : reconstruit les paragraphes (wpautop) des contenus importés
 * de WordPress qui n'avaient pas de balises <p> (articles + livres).
 *   bun run scripts/backfill-paragraphs.ts
 */
import { readFileSync } from 'node:fs';
import { Surreal, RecordId } from 'surrealdb';
import { wpautop, hasParagraphs } from '../src/lib/server/wpautop';

for (const l of readFileSync('.env', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const db = new Surreal();
await db.connect(process.env.SURREAL_URL!, { versionCheck: false });
await db.use({ namespace: process.env.SURREAL_NAMESPACE!, database: process.env.SURREAL_DATABASE! });
await db.signin({ username: process.env.SURREAL_USER!, password: process.env.SURREAL_PASS! } as any);
const q = async (s: string, v?: any) => (await db.query(s, v))[0] as any[];

// Filets de sécurité : champs non-optionnels qui pourraient valoir NONE (sinon
// l'UPDATE échoue en SCHEMAFULL en revalidant tout l'enregistrement).
await db.query('UPDATE article SET views = 0 WHERE views = NONE');
await db.query('UPDATE book SET stock_qty = 0 WHERE stock_qty = NONE');
await db.query('UPDATE book SET featured = false WHERE featured = NONE');

// ── Articles ──
const arts = await q('SELECT meta::id(id) AS pid, body_html FROM article WHERE body_html != NONE');
let aFixed = 0, aErr = 0; const aErrs: string[] = [];
for (const a of arts) {
  if (hasParagraphs(a.body_html)) continue;
  const html = wpautop(a.body_html);
  if (html === a.body_html) continue;
  try { await db.query('UPDATE $id SET body_html = $h', { id: new RecordId('article', a.pid), h: html }); aFixed++; }
  catch (e: any) { aErr++; if (aErrs.length < 3) aErrs.push(String(e.message).split('\n')[0]); }
}
console.log(`Articles : ${aFixed} reformatés / ${arts.length} · erreurs ${aErr}`, aErrs.length ? aErrs : '');

// ── Livres ──
const books = await q('SELECT meta::id(id) AS pid, description_html, extra_info_html FROM book WHERE description_html != NONE OR extra_info_html != NONE');
let bFixed = 0, bErr = 0; const bErrs: string[] = [];
for (const b of books) {
  const upd: Record<string, string> = {};
  if (b.description_html && !hasParagraphs(b.description_html)) { const h = wpautop(b.description_html); if (h !== b.description_html) upd.description_html = h; }
  if (b.extra_info_html && !hasParagraphs(b.extra_info_html)) { const h = wpautop(b.extra_info_html); if (h !== b.extra_info_html) upd.extra_info_html = h; }
  if (!Object.keys(upd).length) continue;
  try {
    const sets = Object.keys(upd).map((k) => `${k} = $${k}`).join(', ');
    await db.query(`UPDATE $id SET ${sets}`, { id: new RecordId('book', b.pid), ...upd });
    bFixed++;
  } catch (e: any) { bErr++; if (bErrs.length < 3) bErrs.push(String(e.message).split('\n')[0]); }
}
console.log(`Livres : ${bFixed} reformatés / ${books.length} · erreurs ${bErr}`, bErrs.length ? bErrs : '');
process.exit(0);
