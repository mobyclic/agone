/**
 * Catalogue — livres & collections (public).
 * Le graphe : book ->contributed_by-> author (typé par rôle).
 */
import { query, recId } from './surreal';
import { uniqueSlug, slugify } from './slug';
import { accentRegex } from '$lib/text';
import { wpautop } from './wpautop';
import { sansScripts, notesDeBasDePage } from '$lib/text';
import { ROLE_ORDER, ROLE_LABEL } from '$lib/labels';
export { ROLE_LABEL };

export interface BookCard {
  id: string;
  title: string;
  subtitle?: string;
  slug: string;
  price_paper?: number;
  price_ebook?: number;
  subscription_price?: number;
  subscription_end?: string;
  status: string;
  published_at?: string;
  featured: boolean;
  cover_url?: string;
  authors: { name: string; slug: string; first_name?: string; last_name?: string }[];
}

function toCard(r: any): BookCard {
  const names: string[] = r.a_names ?? [];
  const slugs: string[] = r.a_slugs ?? [];
  const firsts: string[] = r.a_first ?? [];
  const lasts: string[] = r.a_last ?? [];
  return {
    id: r.id,
    title: r.title,
    subtitle: r.subtitle ?? undefined,
    slug: r.slug,
    price_paper: r.price_paper ?? undefined,
    price_ebook: r.price_ebook ?? undefined,
    subscription_price: r.subscription_price ?? undefined,
    subscription_end: r.subscription_end ?? undefined,
    status: r.status,
    published_at: r.published_at ?? undefined,
    featured: r.featured ?? false,
    cover_url: r.cover_url ?? undefined,
    authors: names
      .map((name, i) => ({ name, slug: slugs[i] ?? '', first_name: firsts[i] ?? undefined, last_name: lasts[i] ?? undefined }))
      .filter((a) => a.name)
  };
}

const CARD_FIELDS = `
  id, title, subtitle, slug, price_paper, price_ebook, subscription_price, subscription_end, status, featured, published_at,
  cover.url AS cover_url,
  ->contributed_by[WHERE role = 'author']->author.full_name AS a_names,
  ->contributed_by[WHERE role = 'author']->author.slug AS a_slugs,
  ->contributed_by[WHERE role = 'author']->author.first_name AS a_first,
  ->contributed_by[WHERE role = 'author']->author.last_name AS a_last
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
    vars.re = accentRegex(opts.q);
    where.push(`(string::matches(title, $re) OR string::matches(subtitle ?? "", $re))`);
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

/** À paraître = publié avec une date de parution strictement future — les plus proches d'abord. */
export async function forthcomingBooks(): Promise<BookCard[]> {
  const rows = await query<any>(
    `SELECT ${CARD_FIELDS} FROM book
       WHERE status = 'published' AND published_at != NONE AND published_at > time::now()
       ORDER BY published_at ASC`
  );
  return rows.map(toCard);
}

/** Derniers parus : publiés ET déjà sortis (date de parution passée ou absente). */
export async function recentBooks(limit = 8): Promise<BookCard[]> {
  const rows = await query<any>(
    `SELECT ${CARD_FIELDS} FROM book
       WHERE status = 'published' AND (published_at = NONE OR published_at <= time::now())
       ORDER BY published_at DESC LIMIT $limit`,
    { limit }
  );
  return rows.map(toCard);
}

/** Recherche de livres pour un sélecteur (back-office). */
export async function searchBooksForPicker(q: string): Promise<{ id: string; title: string; image?: string }[]> {
  if (!q || !q.trim()) return [];
  return query<any>(
    `SELECT id, title, cover.url AS image FROM book WHERE string::lowercase(title) CONTAINS $q ORDER BY title ASC LIMIT 12`,
    { q: q.trim().toLowerCase() }
  );
}

/** Recherche livres pour la commande rapide : id + titre + prix + ISBN (par titre ou ISBN). */
export async function searchBooksForOrder(
  qRaw: string
): Promise<{ id: string; title: string; price_paper?: number; price_ebook?: number; isbn_paper?: string }[]> {
  const q = (qRaw ?? '').trim().toLowerCase();
  if (q.length < 2) return [];
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, title, price_paper, price_ebook, isbn_paper FROM book
       WHERE string::lowercase(title) CONTAINS $q OR (isbn_paper ?? '') CONTAINS $q
       ORDER BY title ASC LIMIT 12`,
    { q }
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    price_paper: r.price_paper ?? undefined,
    price_ebook: r.price_ebook ?? undefined,
    isbn_paper: r.isbn_paper ?? undefined
  }));
}

/** Autres livres du même auteur (par slug d'auteur). */
/** Cartes complètes (couverture + auteurs) pour une liste de slugs, ordre préservé. */
export async function bookCardsBySlugs(slugs: string[]): Promise<BookCard[]> {
  if (!slugs.length) return [];
  const rows = await query<any>(`SELECT ${CARD_FIELDS} FROM book WHERE slug IN $slugs`, { slugs });
  const bySlug = new Map<string, BookCard>(rows.map((r) => [r.slug as string, toCard(r)]));
  return slugs.map((s) => bySlug.get(s)).filter((b): b is BookCard => !!b);
}

/**
 * Livres dont la personne est L'AUTEUR (rôle `author`).
 *
 * LE FILTRE DE RÔLE EST LE POINT : sans lui, la requête ramenait tout livre où
 * la personne apparaît sur l'arête `contributed_by`, préface et traduction
 * comprises — « L'industrie du mensonge » se retrouvait ainsi « du même auteur »
 * que « Décroiscience » au seul motif d'une préface commune. Les autres rôles
 * sont servis à part par `booksContributedBySlug`.
 */
export async function booksByAuthorSlug(authorSlug: string, excludeBookId: string, limit = 4): Promise<BookCard[]> {
  const rows = await query<any>(
    `SELECT ${CARD_FIELDS} FROM book
       WHERE status = 'published' AND id != $ex
         AND ->contributed_by[WHERE role = 'author']->author.slug CONTAINS $a
       ORDER BY published_at DESC LIMIT $limit`,
    { a: authorSlug, ex: recId('book', excludeBookId), limit }
  );
  return rows.map(toCard);
}

/**
 * Livres auxquels la personne a contribué SANS en être l'auteur : préface,
 * postface, traduction, illustration, édition. Complément de la fonction
 * ci-dessus — les deux ensembles sont disjoints par construction.
 */
export async function booksContributedBySlug(authorSlug: string, excludeBookId: string, limit = 6): Promise<BookCard[]> {
  const rows = await query<any>(
    `SELECT ${CARD_FIELDS} FROM book
       WHERE status = 'published' AND id != $ex
         AND ->contributed_by[WHERE role != 'author']->author.slug CONTAINS $a
         AND !(->contributed_by[WHERE role = 'author']->author.slug CONTAINS $a)
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
  subscription_end?: string;
  published_at?: string;
  page_count?: number;
  width_cm?: number;
  height_cm?: number;
  stock_qty: number;
  language_original?: string;
  title_original?: string;
  gallery: string[];
  collections: { name: string; slug: string }[];
  contributors: { role: string; people: { name: string; slug: string }[] }[];
}

/** Slug actuel d'un livre renommé, à partir d'un de ses anciens slugs (redirection). */
export async function slugActuelLivre(ancien: string): Promise<string | null> {
  const r = await query<string>(`SELECT VALUE slug FROM book WHERE $s INSIDE (old_slugs ?? []) LIMIT 1`, { s: ancien });
  return r[0] ?? null;
}

/** Paramètre d'URL du back-office (slug, ou id brut des anciens liens) → id du livre. */
export async function resoudreLivreAdmin(param: string): Promise<{ id: string; slug: string } | null> {
  const parSlug = await query<any>(`SELECT meta::id(id) AS id, slug FROM book WHERE slug = $s LIMIT 1`, { s: param });
  if (parSlug[0]) return parSlug[0];
  if (!/^[a-z0-9]{10,}$/i.test(param)) return null;
  const parId = await query<any>(`SELECT meta::id(id) AS id, slug FROM $id`, { id: recId('book', param) });
  return parId[0]?.id ? parId[0] : null;
}

/** `apercu` (staff) : renvoie aussi brouillons et livres archivés, invisibles du public. */
export async function getBookBySlug(slug: string, apercu = false): Promise<BookDetail | null> {
  const rows = await query<any>(
    `SELECT *, cover.url AS cover_url, gallery.url AS gallery_urls,
       collections.{ name: name, slug: slug } AS collection_refs
     FROM book WHERE slug = $slug LIMIT 1`,
    { slug }
  );
  const b = rows[0];
  if (!b || (b.status !== 'published' && !apercu)) return null;

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
    description_html: notesDeBasDePage(sansScripts(b.description_html)),
    extra_info_html: sansScripts(b.extra_info_html),
    isbn_paper: b.isbn_paper ?? undefined,
    isbn_ebook: b.isbn_ebook ?? undefined,
    subscription_price: b.subscription_price ?? undefined,
    subscription_end: b.subscription_end ?? undefined,
    published_at: b.published_at ?? undefined,
    page_count: b.page_count ?? undefined,
    width_cm: b.width_cm ?? undefined,
    height_cm: b.height_cm ?? undefined,
    stock_qty: b.stock_qty ?? 0,
    language_original: b.language_original ?? undefined,
    title_original: b.title_original ?? undefined,
    gallery: (b.gallery_urls ?? []).filter(Boolean),
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

/** Collections pour la nav : cible = la fiche livre directement si la collection n'a qu'un titre. */
export async function collectionsForNav(): Promise<{ name: string; slug: string; href: string }[]> {
  const colls = await listCollections(); // { id, name, slug, book_count }, book_count > 0
  const singleIds = colls.filter((c) => c.book_count === 1).map((c) => String(c.id));
  const bookByColl = new Map<string, string>();
  if (singleIds.length) {
    const rows = await query<any>(
      `SELECT slug, primary_collection AS pc FROM book
         WHERE status = 'published' AND primary_collection IN $ids`,
      { ids: singleIds.map((id) => recId('collection', id)) }
    );
    for (const r of rows) if (r.pc && !bookByColl.has(String(r.pc))) bookByColl.set(String(r.pc), r.slug);
  }
  return colls.map((c) => {
    const bookSlug = c.book_count === 1 ? bookByColl.get(String(c.id)) : undefined;
    return { name: c.name, slug: c.slug, href: bookSlug ? `/livre/${bookSlug}` : `/collections/${c.slug}` };
  });
}

export async function getCollectionBySlug(slug: string): Promise<{ collection: any; books: BookCard[] } | null> {
  const rows = await query<any>(`SELECT id, name, slug, subtitle, description FROM collection WHERE slug = $slug LIMIT 1`, { slug });
  const collection = rows[0];
  if (!collection) return null;
  collection.description_html = collection.description ? wpautop(collection.description) : undefined;
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
  title: 'title', status: 'status', isbn: 'isbn_paper', price: 'price_paper',
  stock: 'stock_qty', date: 'published_at', recent: 'updated_at'
};

export async function listBooksAdmin(opts: { q?: string; status?: string; sort?: string; dir?: string; limit?: number; offset?: number } = {}) {
  const where: string[] = [];
  const vars: Record<string, unknown> = { limit: opts.limit ?? 50, start: opts.offset ?? 0 };
  if (opts.status === 'forthcoming') {
    // Filtre virtuel « à paraître » : publié + date de parution strictement future.
    where.push("status = 'published' AND published_at != NONE AND published_at > time::now()");
  } else if (opts.status === 'epuise') {
    // Filtre virtuel « épuisé » : en ligne, déjà paru, plus de stock.
    where.push("status = 'published' AND (published_at = NONE OR published_at <= time::now()) AND stock_qty <= 0");
  } else if (opts.status) {
    where.push('status = $status'); vars.status = opts.status;
  }
  if (opts.q && opts.q.trim()) { vars.q = opts.q.trim().toLowerCase(); where.push('string::lowercase(title) CONTAINS $q'); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const field = ADMIN_SORT[opts.sort ?? 'recent'] ?? 'updated_at';
  const dir = opts.dir === 'asc' ? 'ASC' : 'DESC';
  const rows = await query<any>(
    `SELECT id, title, subtitle, slug, status, isbn_paper, price_paper, price_ebook, stock_qty, published_at, updated_at,
        cover.url AS cover_url,
        ->contributed_by[WHERE role = 'author']->author.full_name AS authors,
        (SELECT VALUE format FROM ebook_asset WHERE book = $parent.id AND status = 'available') AS ebook_formats
       FROM book ${whereSql} ORDER BY ${field} ${dir} LIMIT $limit START $start`, vars);
  const count = await query<any>(`SELECT count() AS n FROM book ${whereSql} GROUP ALL`, vars);
  return { books: rows, total: count[0]?.n ?? 0 };
}

export async function getBookAdmin(id: string) {
  const rows = await query<any>(
    `SELECT *, cover.url AS cover_url, gallery AS gallery_refs, gallery.url AS gallery_urls FROM book WHERE id = $id LIMIT 1`,
    { id: recId('book', id) }
  );
  const book = rows[0];
  if (!book) return null;
  book.gallery = (book.gallery_refs ?? [])
    .map((ref: any, i: number) => ({ id: String(ref).replace(/^media:/, ''), url: (book.gallery_urls ?? [])[i] }))
    .filter((g: any) => g.url);
  const contributors = await query<any>(
    `SELECT out AS author_id, out.full_name AS author_name, out.slug AS author_slug, role, share, position
       FROM contributed_by WHERE in = $id ORDER BY position`, { id: recId('book', id) });
  return { book, contributors };
}

export async function allRubriques() {
  return query<any>(`SELECT id, name, slug FROM rubrique ORDER BY name ASC`);
}

/** Toutes les collections (non filtrées) — pour les sélecteurs d'admin. */
export async function allCollections() {
  const colls = await query<any>(`SELECT id, name, slug, sort FROM collection ORDER BY sort ASC`);
  const pub = await query<any>(
    `SELECT primary_collection AS c, count() AS n FROM book WHERE status = 'published' AND primary_collection != NONE GROUP BY primary_collection`
  );
  const byPub = new Map<string, number>();
  for (const r of pub) if (r.c) byPub.set(String(r.c), r.n ?? 0);
  return colls.map((r) => ({ ...r, visible: (byPub.get(String(r.id)) ?? 0) > 0 }));
}

/* ————————————————————— Collections (back-office CRUD + ordre) ————————————————————— */

export interface AdminCollection { id: string; name: string; slug: string; sort: number; book_count: number; published_count: number; visible: boolean }

export async function listCollectionsAdmin(): Promise<AdminCollection[]> {
  const colls = await query<any>(`SELECT id, meta::id(id) AS pid, name, slug, sort FROM collection ORDER BY sort ASC`);
  // Total (tous statuts) + publiés (= critère d'affichage sur le site, cf. listCollections).
  const counts = await query<any>(
    `SELECT primary_collection AS c, count() AS n FROM book WHERE primary_collection != NONE GROUP BY primary_collection`
  );
  const pub = await query<any>(
    `SELECT primary_collection AS c, count() AS n FROM book WHERE status = 'published' AND primary_collection != NONE GROUP BY primary_collection`
  );
  const byColl = new Map<string, number>();
  for (const r of counts) if (r.c) byColl.set(String(r.c), r.n ?? 0);
  const byPub = new Map<string, number>();
  for (const r of pub) if (r.c) byPub.set(String(r.c), r.n ?? 0);
  return colls.map((r) => {
    const published_count = byPub.get(String(r.id)) ?? 0;
    return {
      id: r.pid, name: r.name, slug: r.slug, sort: r.sort ?? 0,
      book_count: byColl.get(String(r.id)) ?? 0,
      published_count,
      visible: published_count > 0
    };
  });
}

/** Livres d'une collection (principale ou membre) — pour la fiche collection admin. */
export async function booksInCollectionAdmin(
  id: string
): Promise<{ id: string; title: string; slug: string; status: string; published_at?: string; cover_url?: string; is_primary: boolean }[]> {
  const c = recId('collection', id);
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, title, slug, status, published_at, cover.url AS cover_url,
        (primary_collection = $c) AS is_primary
      FROM book WHERE primary_collection = $c OR collections CONTAINS $c
      ORDER BY published_at DESC`,
    { c }
  );
  return rows.map((r) => ({
    id: r.id, title: r.title, slug: r.slug, status: r.status,
    published_at: r.published_at ?? undefined, cover_url: r.cover_url ?? undefined,
    is_primary: !!r.is_primary
  }));
}

export async function getCollectionForEdit(id: string) {
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, name, slug, subtitle, description, sort FROM collection WHERE id = $id LIMIT 1`,
    { id: recId('collection', id) }
  );
  const c = rows[0];
  if (!c) return null;
  c.book_count = (await query<any>(
    `SELECT count() AS n FROM book WHERE primary_collection = $c OR collections CONTAINS $c GROUP ALL`,
    { c: recId('collection', id) }
  ))[0]?.n ?? 0;
  return c;
}

export async function saveCollection(id: string | null, d: { name: string; slug?: string; subtitle?: string; description?: string }): Promise<string> {
  const set: string[] = ['name = $name'];
  const vars: Record<string, unknown> = { name: d.name.trim() || '(sans nom)' };
  if (d.subtitle?.trim()) { set.push('subtitle = $subtitle'); vars.subtitle = d.subtitle.trim(); }
  else set.push('subtitle = NONE');
  if (d.description?.trim()) { set.push('description = $description'); vars.description = d.description.trim(); }
  else set.push('description = NONE');

  if (id) {
    if (d.slug?.trim()) {
      vars.slug = await uniqueSlug('collection', d.slug, { excludeId: id });
      set.push('slug = $slug');
    }
    await query(`UPDATE $id SET ${set.join(', ')}`, { ...vars, id: recId('collection', id) });
    return id;
  }
  vars.slug = await uniqueSlug('collection', d.slug || d.name);
  set.push('slug = $slug');
  const maxRow = (await query<any>(`SELECT math::max(sort) AS m FROM collection GROUP ALL`))[0];
  vars.sort = (typeof maxRow?.m === 'number' ? maxRow.m : -1) + 1;
  set.push('sort = $sort');
  const rows = await query<any>(`CREATE collection SET ${set.join(', ')}`, vars);
  return String(rows[0].id).replace(/^collection:/, '');
}

/** Supprime une collection — INTERDIT si des livres y sont rattachés. */
export async function deleteCollection(id: string): Promise<void> {
  const n = (await query<any>(
    `SELECT count() AS n FROM book WHERE primary_collection = $c OR collections CONTAINS $c GROUP ALL`,
    { c: recId('collection', id) }
  ))[0]?.n ?? 0;
  if (n > 0) throw new Error('COLLECTION_HAS_BOOKS');
  await query(`DELETE $id`, { id: recId('collection', id) });
}

export async function reorderCollections(orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await query(`UPDATE $id SET sort = $s`, { id: recId('collection', orderedIds[i]), s: i });
  }
}

export interface BookInput {
  title: string; subtitle?: string; description_html?: string; extra_info_html?: string;
  title_original?: string; title_alt?: string; language_original?: string;
  status: string; isbn_paper?: string; isbn_ebook?: string;
  price_paper?: number; price_ebook?: number; subscription_price?: number; subscription_end?: string;
  published_at?: string; page_count?: number; width_cm?: number; height_cm?: number; weight_grams?: number;
  stock_qty?: number; featured?: boolean; keywords?: string[];
  /** Nouveau slug (édition) : l'ancien est gardé dans `old_slugs` pour la redirection. */
  slug?: string;
  collectionIds: string[]; rubriqueIds: string[]; primaryCollectionId?: string; coverId?: string; galleryIds?: string[];
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
    subscription_end: d.subscription_end ? new Date(d.subscription_end) : undefined,
    published_at: d.published_at ? new Date(d.published_at) : undefined,
    page_count: d.page_count, width_cm: d.width_cm, height_cm: d.height_cm, weight_grams: d.weight_grams,
    stock_qty: d.stock_qty ?? 0, featured: !!d.featured,
    primary_collection: d.primaryCollectionId ? recId('collection', d.primaryCollectionId) : undefined,
    cover: d.coverId ? recId('media', d.coverId) : undefined
  });
  // Les tableaux sont toujours écrits (même vides).
  vars.collections = d.collectionIds.map((x) => recId('collection', x));
  vars.rubriques = d.rubriqueIds.map((x) => recId('rubrique', x));
  vars.gallery = (d.galleryIds ?? []).map((x) => recId('media', x));
  vars.keywords = d.keywords ?? [];
  const arraysSql = 'collections = $collections, rubriques = $rubriques, gallery = $gallery, keywords = $keywords';

  if (id) {
    await query(`UPDATE $id SET ${sql}, ${arraysSql}`, { ...vars, id: recId('book', id) });
    if (d.slug?.trim()) {
      const actuel = (await query<string>(`SELECT VALUE slug FROM $id`, { id: recId('book', id) }))[0];
      const voulu = slugify(d.slug);
      if (voulu && voulu !== actuel) {
        const nouveau = await uniqueSlug('book', voulu, { excludeId: id });
        await query(
          `UPDATE $id SET slug = $s, old_slugs = array::distinct(array::append(old_slugs ?? [], $ancien))`,
          { id: recId('book', id), s: nouveau, ancien: actuel }
        );
      }
    }
    return id;
  }
  const slug = await uniqueSlug('book', d.slug?.trim() || d.title);
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

/** Vocabulaire des mots-clés déjà employés (suggestions à la saisie), du plus fréquent au plus rare. */
export async function allBookKeywords(): Promise<string[]> {
  const rows = await query<any>(`SELECT keywords FROM book WHERE array::len(keywords ?? []) > 0`);
  const freq = new Map<string, number>();
  for (const r of rows) for (const k of r.keywords ?? []) freq.set(k, (freq.get(k) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')).map(([k]) => k);
}

/* ————————————————————— Catalogue complet à facettes (public) ————————————————————— */

export interface CatalogueBook extends BookCard {
  collection?: { slug: string; name: string };
  keywords: string[];
}

/**
 * Tout le catalogue en ligne (~400 titres) en UNE requête : la page /catalogue
 * filtre, compte les facettes et trie côté client, instantanément.
 */
export async function catalogueComplet(): Promise<CatalogueBook[]> {
  const rows = await query<any>(
    `SELECT ${CARD_FIELDS}, keywords,
        (primary_collection ?? collections[0]).slug AS c_slug,
        (primary_collection ?? collections[0]).name AS c_name
       FROM book WHERE status = 'published'
       ORDER BY published_at DESC`
  );
  return rows.map((r) => ({
    ...toCard(r),
    collection: r.c_slug ? { slug: r.c_slug, name: r.c_name } : undefined,
    keywords: (r.keywords ?? []).filter(Boolean)
  }));
}
