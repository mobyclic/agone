/**
 * Migration catalogue WordPress → SurrealDB (idempotent : ré-exécutable).
 * Lit les dumps JSON-lines produits depuis la BDD de prod (lecture seule) :
 *   scratchpad/wp/{collections,rubriques,authors,books,books_meta,book_terms}.json
 * Injecte : collection, rubrique, author, book + arêtes contributed_by (par rôle).
 * Les couvertures sont migrées séparément (migrate-covers.ts).
 *
 *   WP_DIR=/chemin/vers/scratchpad/wp bun run scripts/migrate-catalogue.ts
 */
import { readFileSync } from 'node:fs';
import { Surreal, RecordId } from 'surrealdb';

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const WP = process.env.WP_DIR;
if (!WP) throw new Error('WP_DIR manquant (dossier des dumps JSON)');

// ── helpers ───────────────────────────────────────────────────
const readJsonl = (f: string): any[] =>
  readFileSync(`${WP}/${f}`, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

function slugify(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
}
const usedSlugs = (set: Set<string>, base: string, fallback: string) => {
  let s = base || fallback;
  if (!s) s = fallback;
  if (!set.has(s)) { set.add(s); return s; }
  let s2 = `${s}-${fallback}`;
  let i = 2;
  while (set.has(s2)) s2 = `${s}-${fallback}-${i++}`;
  set.add(s2);
  return s2;
};
function wpDate(v: any): Date | undefined {
  const s = String(v ?? '').trim();
  if (!/^\d{8}$/.test(s)) return undefined;
  const y = s.slice(0, 4), m = s.slice(4, 6), d = s.slice(6, 8);
  const iso = `${y}-${m === '00' ? '01' : m}-${d === '00' ? '01' : d}T00:00:00Z`;
  const dt = new Date(iso);
  return isNaN(+dt) ? undefined : dt;
}
function num(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}
const int = (v: any): number | undefined => { const n = num(v); return n === undefined ? undefined : Math.round(n); };
const truthy = (v: any) => ['1', 'true', 'yes', 'on'].includes(String(v ?? '').toLowerCase());
const parseIds = (serialized: any): number[] => {
  const s = String(serialized ?? '');
  const out: number[] = [];
  const re = /s:\d+:"(\d+)"/g;
  let m;
  while ((m = re.exec(s))) out.push(Number(m[1]));
  return out;
};

async function chunkedInsert(db: Surreal, table: string, rows: any[], size = 100) {
  for (let i = 0; i < rows.length; i += size) {
    await db.query(`INSERT INTO ${table} $d`, { d: rows.slice(i, i + size) });
  }
}

// ── connexion ─────────────────────────────────────────────────
const db = new Surreal();
await db.connect(process.env.SURREAL_URL!, { versionCheck: false });
await db.use({ namespace: process.env.SURREAL_NAMESPACE!, database: process.env.SURREAL_DATABASE! });
await db.signin({ username: process.env.SURREAL_USER!, password: process.env.SURREAL_PASS! });
console.log('→ Migration catalogue', process.env.SURREAL_NAMESPACE, '/', process.env.SURREAL_DATABASE);

// Table rase (idempotence)
await db.query('DELETE contributed_by; DELETE book; DELETE author; DELETE collection; DELETE rubrique;');

// ── COLLECTIONS ───────────────────────────────────────────────
const collSlugs = new Set<string>();
const collRows = readJsonl('collections.json').map((c, i) => ({
  name: c.name, slug: usedSlugs(collSlugs, slugify(c.name), String(c.term_id)),
  sort: i, legacy_term_id: Number(c.term_id)
}));
await chunkedInsert(db, 'collection', collRows);
const collMap = new Map<number, RecordId>();
for (const r of await db.query<any[]>('SELECT id, legacy_term_id FROM collection').then((r) => r[0]))
  collMap.set(Number(r.legacy_term_id), r.id);
console.log('  ✓ collections:', collRows.length);

// ── RUBRIQUES ─────────────────────────────────────────────────
const rubSlugs = new Set<string>();
const rubRows = readJsonl('rubriques.json').map((c, i) => ({
  name: c.name, slug: usedSlugs(rubSlugs, slugify(c.name), String(c.term_id)),
  kind: 'both', sort: i, legacy_term_id: Number(c.term_id)
}));
await chunkedInsert(db, 'rubrique', rubRows);
const rubMap = new Map<number, RecordId>();
for (const r of await db.query<any[]>('SELECT id, legacy_term_id FROM rubrique').then((r) => r[0]))
  rubMap.set(Number(r.legacy_term_id), r.id);
console.log('  ✓ rubriques:', rubRows.length);

// ── AUTHORS ───────────────────────────────────────────────────
const authSlugs = new Set<string>();
const authRows = readJsonl('authors.json').map((a) => {
  let first = (a.prenom ?? '').trim();
  let last = (a.nom ?? '').trim();
  if (!first && !last) {
    const parts = String(a.title ?? '').trim().split(/\s+/);
    last = parts.pop() ?? '';
    first = parts.join(' ');
  }
  return {
    first_name: first, last_name: last || String(a.title ?? '').trim(),
    slug: usedSlugs(authSlugs, slugify(a.title), String(a.id)),
    bio_html: a.bio || undefined,
    hidden: truthy(a.hide),
    legacy_wp_id: Number(a.id)
  };
});
await chunkedInsert(db, 'author', authRows, 150);
const authMap = new Map<number, RecordId>();
for (const r of await db.query<any[]>('SELECT id, legacy_wp_id FROM author').then((r) => r[0]))
  authMap.set(Number(r.legacy_wp_id), r.id);
console.log('  ✓ authors:', authRows.length);

// ── BOOKS ─────────────────────────────────────────────────────
const metaByPost = new Map<number, Record<string, string>>();
for (const m of readJsonl('books_meta.json')) {
  const pid = Number(m.post_id);
  if (!metaByPost.has(pid)) metaByPost.set(pid, {});
  metaByPost.get(pid)![m.k] = m.v;
}
const collByPost = new Map<number, RecordId[]>();
const rubByPost = new Map<number, RecordId[]>();
for (const t of readJsonl('book_terms.json')) {
  const pid = Number(t.post_id), tid = Number(t.term_id);
  if (t.tax === 'collection' && collMap.has(tid)) {
    (collByPost.get(pid) ?? collByPost.set(pid, []).get(pid)!).push(collMap.get(tid)!);
  } else if (t.tax === 'category' && rubMap.has(tid)) {
    (rubByPost.get(pid) ?? rubByPost.set(pid, []).get(pid)!).push(rubMap.get(tid)!);
  }
}

const bookSlugs = new Set<string>();
const bookPosts = readJsonl('books.json');
const bookRows: any[] = [];
for (const b of bookPosts) {
  const pid = Number(b.id);
  const meta = metaByPost.get(pid) ?? {};
  const cols = collByPost.get(pid) ?? [];
  bookRows.push({
    title: b.title, slug: usedSlugs(bookSlugs, slugify(b.title || b.slug), String(pid)),
    subtitle: meta.sous_titre || undefined,
    description_html: b.content || undefined,
    extra_info_html: meta.infos_additionnelles || undefined,
    title_original: meta.titre_originale || undefined,
    title_alt: meta.titre_alternatif || undefined,
    language_original: meta.langue_originale || undefined,
    status: b.status === 'draft' ? 'forthcoming' : 'published',
    isbn_paper: (meta.isbn_papier || '').trim() || undefined,
    isbn_ebook: (meta.isbn_digital || '').trim() || undefined,
    price_paper: num(meta.prix_papier),
    price_ebook: num(meta.prix_digital),
    subscription_price: num(meta.tarif_souscription),
    subscription_end: wpDate(meta.date_souscription),
    published_at: wpDate(meta.date_de_publication),
    published_original: wpDate(meta.date_de_publication_originale),
    page_count: int(meta.nombre_de_pages),
    width_cm: num(meta.cover_largeur),
    height_cm: num(meta.cover_hauteur),
    stock_qty: int(meta.qte_stock) ?? 0,
    featured: truthy(meta.focus),
    collections: cols,
    primary_collection: cols[0],
    rubriques: rubByPost.get(pid) ?? [],
    legacy_wp_id: pid
  });
}
await chunkedInsert(db, 'book', bookRows, 60);
const bookMap = new Map<number, RecordId>();
for (const r of await db.query<any[]>('SELECT id, legacy_wp_id FROM book').then((r) => r[0]))
  bookMap.set(Number(r.legacy_wp_id), r.id);
console.log('  ✓ books:', bookRows.length);

// ── CONTRIBUTED_BY (arêtes livre → auteur, typées par rôle) ────
const ROLE_FIELDS: [string, string][] = [
  ['livre_auteurs', 'author'],
  ['livre_traducteurs', 'translator'],
  ['livre_auteurs_preface', 'preface'],
  ['livre_auteurs_postface', 'postface'],
  ['livre_auteurs_divers', 'other']
];
const edges: { b: RecordId; a: RecordId; role: string; position: number }[] = [];
for (const b of bookPosts) {
  const pid = Number(b.id);
  const bRec = bookMap.get(pid);
  if (!bRec) continue;
  const meta = metaByPost.get(pid) ?? {};
  for (const [field, role] of ROLE_FIELDS) {
    const ids = parseIds(meta[field]);
    ids.forEach((aid, idx) => {
      const aRec = authMap.get(aid);
      if (aRec) edges.push({ b: bRec, a: aRec, role, position: idx });
    });
  }
}
let done = 0;
for (let i = 0; i < edges.length; i += 25) {
  await Promise.all(
    edges.slice(i, i + 25).map((e) =>
      db.query('RELATE $b->contributed_by->$a SET role=$role, position=$position, share=100', e)
    )
  );
  done += Math.min(25, edges.length - i);
}
console.log('  ✓ contributions (edges):', edges.length);

console.log('✓ Migration catalogue terminée');
await db.close();
process.exit(0);
