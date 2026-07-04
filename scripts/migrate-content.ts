/**
 * Migration contenu éditorial WordPress → SurrealDB : articles (Antichambre) + pages statiques.
 *   WP_DIR=/chemin bun run scripts/migrate-content.ts
 */
import { readFileSync } from 'node:fs';
import { Surreal, RecordId } from 'surrealdb';

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const WP = process.env.WP_DIR;
if (!WP) throw new Error('WP_DIR manquant');

const readJsonl = (f: string): any[] =>
  readFileSync(`${WP}/${f}`, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
function slugify(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
}
function wpDateTime(v: any): Date | undefined {
  const s = String(v ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return undefined;
  const dt = new Date(s); return isNaN(+dt) ? undefined : dt;
}
const parseIds = (s: any): number[] => {
  const out: number[] = []; const re = /s:\d+:"(\d+)"/g; let m;
  while ((m = re.exec(String(s ?? '')))) out.push(Number(m[1])); return out;
};
const strip = (html: string) => (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
async function chunkedInsert(db: Surreal, table: string, rows: any[], size = 60) {
  for (let i = 0; i < rows.length; i += size) await db.query(`INSERT INTO ${table} $d`, { d: rows.slice(i, i + size) });
}

const db = new Surreal();
await db.connect(process.env.SURREAL_URL!, { versionCheck: false });
await db.use({ namespace: process.env.SURREAL_NAMESPACE!, database: process.env.SURREAL_DATABASE! });
await db.signin({ username: process.env.SURREAL_USER!, password: process.env.SURREAL_PASS! });
console.log('→ Migration contenu', process.env.SURREAL_NAMESPACE, '/', process.env.SURREAL_DATABASE);

await db.query('DELETE article; DELETE page;');

// Maps
const authMap = new Map<number, RecordId>();
for (const r of (await db.query<any[]>('SELECT id, legacy_wp_id FROM author'))[0]) authMap.set(Number(r.legacy_wp_id), r.id);
const bookMap = new Map<number, RecordId>();
for (const r of (await db.query<any[]>('SELECT id, legacy_wp_id FROM book'))[0]) bookMap.set(Number(r.legacy_wp_id), r.id);
const rubMap = new Map<number, RecordId>();
for (const r of (await db.query<any[]>('SELECT id, legacy_term_id FROM rubrique'))[0]) rubMap.set(Number(r.legacy_term_id), r.id);

// rubrique par article (première catégorie mappée)
const rubByPost = new Map<number, RecordId>();
for (const t of readJsonl('article_terms.json')) {
  const pid = Number(t.post_id), tid = Number(t.term_id);
  if (!rubByPost.has(pid) && rubMap.has(tid)) rubByPost.set(pid, rubMap.get(tid)!);
}

// ── ARTICLES ──────────────────────────────────────────────────
const artSlugs = new Set<string>();
const artRows: any[] = [];
for (const a of readJsonl('articles.json')) {
  const pid = Number(a.id);
  let slug = slugify(a.title || a.slug) || `article-${pid}`;
  let s = slug, i = 2; while (artSlugs.has(s)) s = `${slug}-${i++}`; artSlugs.add(s);
  const excerpt = (a.excerpt && strip(a.excerpt)) || strip(a.content).slice(0, 220) || undefined;
  artRows.push({
    title: a.title, slug: s, body_html: a.content || undefined, excerpt,
    published_at: wpDateTime(a.date),
    rubrique: rubByPost.get(pid),
    is_newsletter_issue: /\[\s*lettrinfo/i.test(a.title || ''),
    authors: parseIds(a.auteurs).map((id) => authMap.get(id)).filter(Boolean),
    books: parseIds(a.livres).map((id) => bookMap.get(id)).filter(Boolean),
    status: 'published', legacy_wp_id: pid
  });
}
await chunkedInsert(db, 'article', artRows, 50);
console.log('  ✓ articles:', artRows.length);

// ── PAGES STATIQUES ───────────────────────────────────────────
const SLUG_MAP: Record<number, string> = { 155: 'a-propos', 157: 'contact', 3744: 'cgv', 3: 'mentions-legales', 643: 'a-paraitre', 645: 'focus' };
const pageRows = readJsonl('pages.json').map((p) => ({
  title: p.title, slug: SLUG_MAP[Number(p.id)] ?? slugify(p.title),
  body_html: p.content || undefined, status: 'published', legacy_wp_id: Number(p.id)
}));
await chunkedInsert(db, 'page', pageRows, 20);
console.log('  ✓ pages:', pageRows.length, '(' + pageRows.map((p) => p.slug).join(', ') + ')');

console.log('✓ Migration contenu terminée');
await db.close();
process.exit(0);
