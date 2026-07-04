/**
 * Catalogue — livres & collections (public).
 * Le graphe : book ->contributed_by-> author (typé par rôle).
 */
import { query, recId } from './surreal';
import { uniqueSlug } from './slug';
import { ROLE_ORDER, ROLE_LABEL } from '$lib/labels';
export { ROLE_LABEL };

export interface BookCard {
  id: string;
  title: string;
  subtitle?: string;
  slug: string;
  price_paper?: number;
  price_ebook?: number;
  status: string;
  featured: boolean;
  cover_url?: string;
  authors: { name: string; slug: string }[];
}

function toCard(r: any): BookCard {
  const names: string[] = r.a_names ?? [];
  const slugs: string[] = r.a_slugs ?? [];
  return {
    id: r.id,
    title: r.title,
    subtitle: r.subtitle ?? undefined,
    slug: r.slug,
    price_paper: r.price_paper ?? undefined,
    price_ebook: r.price_ebook ?? undefined,
    status: r.status,
    featured: r.featured ?? false,
    cover_url: r.cover_url ?? undefined,
    authors: names.map((name, i) => ({ name, slug: slugs[i] ?? '' })).filter((a) => a.name)
  };
}

const CARD_FIELDS = `
  id, title, subtitle, slug, price_paper, price_ebook, status, featured, published_at,
  cover.url AS cover_url,
  ->contributed_by[WHERE role = 'author']->author.full_name AS a_names,
  ->contributed_by[WHERE role = 'author']->author.slug AS a_slugs
`;

export interface ListBooksOpts {
  q?: string;
  collection?: string; // slug
  rubrique?: string; // slug
  sort?: 'recent' | 'title' | 'price_asc';
  limit?: number;
  offset?: number;
}

export async function listBooks(opts: ListBooksOpts = {}): Promise<{ books: BookCard[]; total: number }> {
  const where = [`status = 'published'`];
  const vars: Record<string, unknown> = { limit: opts.limit ?? 24, start: opts.offset ?? 0 };

  if (opts.collection) {
    where.push('primary_collection.slug = $coll OR collections.slug CONTAINS $coll');
    vars.coll = opts.collection;
  }
  if (opts.rubrique) {
    where.push('rubriques.slug CONTAINS $rub');
    vars.rub = opts.rubrique;
  }
  if (opts.q && opts.q.trim()) {
    vars.q = opts.q.trim().toLowerCase();
    where.push('(string::lowercase(title) CONTAINS $q OR string::lowercase(subtitle ?? "") CONTAINS $q)');
  }

  const order =
    opts.sort === 'title' ? 'title ASC' : opts.sort === 'price_asc' ? 'price_paper ASC' : 'published_at DESC';

  const whereSql = where.join(' AND ');
  const rows = await query<any>(
    `SELECT ${CARD_FIELDS} FROM book WHERE ${whereSql} ORDER BY ${order} LIMIT $limit START $start`,
    vars
  );
  const countRows = await query<any>(`SELECT count() AS n FROM book WHERE ${whereSql} GROUP ALL`, vars);
  return { books: rows.map(toCard), total: countRows[0]?.n ?? 0 };
}

/** Livres mis en avant (accueil). */
export async function featuredBooks(limit = 8): Promise<BookCard[]> {
  const rows = await query<any>(
    `SELECT ${CARD_FIELDS} FROM book WHERE status = 'published' AND featured = true ORDER BY published_at DESC LIMIT $limit`,
    { limit }
  );
  return rows.map(toCard);
}

/** À paraître (souscription / drafts) — les plus proches d'abord. */
export async function forthcomingBooks(): Promise<BookCard[]> {
  const rows = await query<any>(
    `SELECT ${CARD_FIELDS} FROM book WHERE status = 'forthcoming' ORDER BY published_at ASC`
  );
  return rows.map(toCard);
}

/** Derniers parus. */
export async function recentBooks(limit = 8): Promise<BookCard[]> {
  const rows = await query<any>(
    `SELECT ${CARD_FIELDS} FROM book WHERE status = 'published' ORDER BY published_at DESC LIMIT $limit`,
    { limit }
  );
  return rows.map(toCard);
}

/** Autres livres du même auteur (par slug d'auteur). */
export async function booksByAuthorSlug(authorSlug: string, excludeBookId: string, limit = 4): Promise<BookCard[]> {
  const rows = await query<any>(
    `SELECT ${CARD_FIELDS} FROM book
       WHERE status = 'published' AND id != $ex AND ->contributed_by->author.slug CONTAINS $a
       ORDER BY published_at DESC LIMIT $limit`,
    { a: authorSlug, ex: recId('book', excludeBookId), limit }
  );
  return rows.map(toCard);
}

/** Autres livres de la même collection. */
export async function booksInCollectionSlug(collSlug: string, excludeBookId: string, limit = 4): Promise<BookCard[]> {
  const rows = await query<any>(
    `SELECT ${CARD_FIELDS} FROM book
       WHERE status = 'published' AND id != $ex AND (primary_collection.slug = $c OR collections.slug CONTAINS $c)
       ORDER BY published_at DESC LIMIT $limit`,
    { c: collSlug, ex: recId('book', excludeBookId), limit }
  );
  return rows.map(toCard);
}

export interface BookDetail extends BookCard {
  description_html?: string;
  extra_info_html?: string;
  isbn_paper?: string;
  isbn_ebook?: string;
  subscription_price?: number;
  published_at?: string;
  page_count?: number;
  width_cm?: number;
  height_cm?: number;
  stock_qty: number;
  language_original?: string;
  title_original?: string;
  collections: { name: string; slug: string }[];
  contributors: { role: string; people: { name: string; slug: string }[] }[];
}

export async function getBookBySlug(slug: string): Promise<BookDetail | null> {
  const rows = await query<any>(
    `SELECT *, cover.url AS cover_url,
       collections.{ name: name, slug: slug } AS collection_refs
     FROM book WHERE slug = $slug LIMIT 1`,
    { slug }
  );
  const b = rows[0];
  if (!b) return null;

  const contribs = await query<any>(
    `SELECT out.full_name AS name, out.slug AS slug, role, position
       FROM contributed_by WHERE in = $id ORDER BY role, position`,
    { id: recId('book', b.id) }
  );
  const byRole = new Map<string, { name: string; slug: string }[]>();
  for (const c of contribs) {
    if (!byRole.has(c.role)) byRole.set(c.role, []);
    byRole.get(c.role)!.push({ name: c.name, slug: c.slug });
  }
  const contributors = ROLE_ORDER.filter((r) => byRole.has(r)).map((role) => ({
    role,
    people: byRole.get(role)!
  }));

  return {
    ...toCard(b),
    description_html: b.description_html ?? undefined,
    extra_info_html: b.extra_info_html ?? undefined,
    isbn_paper: b.isbn_paper ?? undefined,
    isbn_ebook: b.isbn_ebook ?? undefined,
    subscription_price: b.subscription_price ?? undefined,
    published_at: b.published_at ?? undefined,
    page_count: b.page_count ?? undefined,
    width_cm: b.width_cm ?? undefined,
    height_cm: b.height_cm ?? undefined,
    stock_qty: b.stock_qty ?? 0,
    language_original: b.language_original ?? undefined,
    title_original: b.title_original ?? undefined,
    collections: (b.collection_refs ?? []).filter((c: any) => c?.slug),
    contributors,
    // authors already on the card; keep the whole-contributor set too
    authors: (byRole.get('author') ?? [])
  };
}

export interface CollectionInfo {
  id: string;
  name: string;
  slug: string;
  book_count: number;
}

export async function listCollections(): Promise<CollectionInfo[]> {
  const colls = await query<any>(`SELECT id, name, slug, sort FROM collection ORDER BY sort ASC`);
  const counts = await query<any>(
    `SELECT primary_collection AS c, count() AS n FROM book
       WHERE status = 'published' AND primary_collection != NONE GROUP BY primary_collection`
  );
  const byColl = new Map<string, number>();
  for (const r of counts) if (r.c) byColl.set(String(r.c), r.n ?? 0);
  return colls
    .map((r) => ({ id: r.id, name: r.name, slug: r.slug, book_count: byColl.get(String(r.id)) ?? 0 }))
    .filter((c) => c.book_count > 0);
}

export async function getCollectionBySlug(slug: string): Promise<{ collection: any; books: BookCard[] } | null> {
  const rows = await query<any>(`SELECT id, name, slug FROM collection WHERE slug = $slug LIMIT 1`, { slug });
  const collection = rows[0];
  if (!collection) return null;
  const books = await query<any>(
    `SELECT ${CARD_FIELDS} FROM book
       WHERE status = 'published' AND (primary_collection.slug = $slug OR collections.slug CONTAINS $slug)
       ORDER BY published_at DESC`,
    { slug }
  );
  return { collection, books: books.map(toCard) };
}

// ══════════════════════════════════════════════════════════════
// ADMINISTRATION (back-office)
// ══════════════════════════════════════════════════════════════

const ADMIN_SORT: Record<string, string> = {
  title: 'title', price: 'price_paper', stock: 'stock_qty', date: 'published_at', recent: 'updated_at'
};

export async function listBooksAdmin(opts: { q?: string; status?: string; sort?: string; dir?: string; limit?: number; offset?: number } = {}) {
  const where: string[] = [];
  const vars: Record<string, unknown> = { limit: opts.limit ?? 50, start: opts.offset ?? 0 };
  if (opts.status) { where.push('status = $status'); vars.status = opts.status; }
  if (opts.q && opts.q.trim()) { vars.q = opts.q.trim().toLowerCase(); where.push('string::lowercase(title) CONTAINS $q'); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const field = ADMIN_SORT[opts.sort ?? 'recent'] ?? 'updated_at';
  const dir = opts.dir === 'asc' ? 'ASC' : 'DESC';
  const rows = await query<any>(
    `SELECT id, title, slug, status, isbn_paper, price_paper, stock_qty, published_at, updated_at, cover.url AS cover_url
       FROM book ${whereSql} ORDER BY ${field} ${dir} LIMIT $limit START $start`, vars);
  const count = await query<any>(`SELECT count() AS n FROM book ${whereSql} GROUP ALL`, vars);
  return { books: rows, total: count[0]?.n ?? 0 };
}

export async function getBookAdmin(id: string) {
  const rows = await query<any>(`SELECT *, cover.url AS cover_url FROM book WHERE id = $id LIMIT 1`, { id: recId('book', id) });
  const book = rows[0];
  if (!book) return null;
  const contributors = await query<any>(
    `SELECT out AS author_id, out.full_name AS author_name, role, share, position
       FROM contributed_by WHERE in = $id ORDER BY position`, { id: recId('book', id) });
  return { book, contributors };
}

export async function allRubriques() {
  return query<any>(`SELECT id, name, slug FROM rubrique ORDER BY name ASC`);
}

/** Toutes les collections (non filtrées) — pour les sélecteurs d'admin. */
export async function allCollections() {
  return query<any>(`SELECT id, name, slug, sort FROM collection ORDER BY sort ASC`);
}

export interface BookInput {
  title: string; subtitle?: string; description_html?: string; extra_info_html?: string;
  title_original?: string; title_alt?: string; language_original?: string;
  status: string; isbn_paper?: string; isbn_ebook?: string;
  price_paper?: number; price_ebook?: number; subscription_price?: number;
  published_at?: string; page_count?: number; width_cm?: number; height_cm?: number;
  stock_qty?: number; featured?: boolean;
  collectionIds: string[]; rubriqueIds: string[]; primaryCollectionId?: string; coverId?: string;
}

/**
 * Construit une clause SET : champ vide → `= NONE` (efface / laisse NONE),
 * sinon `= $var`. Évite d'envoyer `NULL` (rejeté par les champs `option<record>`).
 */
function buildSet(fields: Record<string, unknown>): { sql: string; vars: Record<string, unknown> } {
  const parts: string[] = [];
  const vars: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    const empty = v === undefined || v === null || v === '' || (typeof v === 'number' && Number.isNaN(v));
    if (empty) parts.push(`${k} = NONE`);
    else { vars[k] = v; parts.push(`${k} = $${k}`); }
  }
  return { sql: parts.join(', '), vars };
}

export async function upsertBook(id: string | null, d: BookInput): Promise<string> {
  const { sql, vars } = buildSet({
    title: d.title, subtitle: d.subtitle, description_html: d.description_html,
    extra_info_html: d.extra_info_html, title_original: d.title_original, title_alt: d.title_alt,
    language_original: d.language_original, status: d.status || 'draft',
    isbn_paper: d.isbn_paper, isbn_ebook: d.isbn_ebook,
    price_paper: d.price_paper, price_ebook: d.price_ebook, subscription_price: d.subscription_price,
    published_at: d.published_at ? new Date(d.published_at) : undefined,
    page_count: d.page_count, width_cm: d.width_cm, height_cm: d.height_cm,
    stock_qty: d.stock_qty ?? 0, featured: !!d.featured,
    primary_collection: d.primaryCollectionId ? recId('collection', d.primaryCollectionId) : undefined,
    cover: d.coverId ? recId('media', d.coverId) : undefined
  });
  // Les tableaux sont toujours écrits (même vides).
  vars.collections = d.collectionIds.map((x) => recId('collection', x));
  vars.rubriques = d.rubriqueIds.map((x) => recId('rubrique', x));
  const arraysSql = 'collections = $collections, rubriques = $rubriques';

  if (id) {
    await query(`UPDATE $id SET ${sql}, ${arraysSql}`, { ...vars, id: recId('book', id) });
    return id;
  }
  const slug = await uniqueSlug('book', d.title);
  const rows = await query<any>(`CREATE book SET ${sql}, ${arraysSql}, slug = $slug`, { ...vars, slug });
  return String(rows[0].id).replace(/^book:/, '');
}

export async function setBookContributors(
  bookId: string,
  contributors: { authorId: string; role: string; share?: number }[]
) {
  await query(`DELETE contributed_by WHERE in = $id`, { id: recId('book', bookId) });
  let pos = 0;
  for (const c of contributors) {
    if (!c.authorId) continue;
    await query(`RELATE $b->contributed_by->$a SET role = $role, share = $share, position = $position`, {
      b: recId('book', bookId), a: recId('author', c.authorId),
      role: c.role || 'author', share: c.share ?? 100, position: pos++
    });
  }
}

export async function deleteBook(id: string) {
  await query(`DELETE contributed_by WHERE in = $id`, { id: recId('book', id) });
  await query(`DELETE $id`, { id: recId('book', id) });
}
