/**
 * Catalogue — livres & collections (public).
 * Le graphe : book ->contributed_by-> author (typé par rôle).
 */
import { query, recId } from './surreal';
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
