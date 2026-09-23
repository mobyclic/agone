/**
 * Auteurs (contributeurs) — index & fiche.
 * book ->contributed_by-> author : depuis un auteur, on remonte ses livres via
 * l'arête inverse `<-contributed_by<-book`.
 */
import { query, recId } from './surreal';
import { uniqueSlug } from './slug';
import { accentRegex, deburr } from '$lib/text';
import { ROLE_LABEL, ROLE_ORDER } from '$lib/labels';

export interface AuthorCard {
  id: string;
  full_name: string;
  slug: string;
  last_name: string;
  first_name: string;
  book_count: number;
}

/**
 * La page publique /auteurs ne liste que les AUTEURS au sens strict : crédités
 * `role = 'author'` sur au moins un livre. Traducteurs, préfaciers et autres
 * contributeurs restent accessibles par leur fiche, pas par l'index.
 */
const IS_AUTHOR = "array::len(<-contributed_by[WHERE role = 'author']<-book) > 0";

/** Tri français : « Étienne » se range avec les E, pas avant les A. */
const byName = new Intl.Collator('fr', { sensitivity: 'base' });

export async function listAuthors(
  opts: { q?: string; letter?: string; onlyAuthors?: boolean } = {}
): Promise<AuthorCard[]> {
  // `onlyAuthors` : index /auteurs. La recherche globale, elle, doit continuer à
  // trouver traducteurs et préfaciers.
  const where = ['hidden = false', opts.onlyAuthors ? IS_AUTHOR : 'array::len(<-contributed_by<-book) > 0'];
  const vars: Record<string, unknown> = {};
  if (opts.letter && /^[a-z]$/i.test(opts.letter)) {
    // Ancré au début et tolérant aux accents : « E » ramène aussi « Étienne ».
    vars.letterRe = `(?i)^${accentRegex(opts.letter).replace('(?i)', '')}`;
    where.push('string::matches(last_name, $letterRe)');
  }
  if (opts.q && opts.q.trim()) {
    vars.re = accentRegex(opts.q);
    where.push('string::matches(full_name, $re)');
  }
  const rows = await query<any>(
    `SELECT id, full_name, slug, last_name, first_name,
        array::len(array::distinct(<-contributed_by<-book)) AS book_count
      FROM author WHERE ${where.join(' AND ')}`,
    vars
  );
  return rows
    .map((r) => ({
      id: r.id,
      full_name: r.full_name,
      slug: r.slug,
      last_name: r.last_name ?? '',
      first_name: r.first_name ?? '',
      book_count: r.book_count ?? 0
    }))
    .sort((a, b) => byName.compare(a.last_name, b.last_name) || byName.compare(a.first_name, b.first_name));
}

/** Lettres de l'alphabet effectivement présentes (pour l'index A–Z). */
export async function authorInitials(): Promise<string[]> {
  const rows = await query<any>(
    `SELECT string::slice(last_name, 0, 1) AS l
       FROM author WHERE hidden = false AND ${IS_AUTHOR}`
  );
  const set = new Set<string>();
  // « Étienne » compte pour la lettre E : on désaccentue avant de classer.
  for (const r of rows) {
    const l = deburr(r.l ?? '').toUpperCase();
    if (/^[A-Z]$/.test(l)) set.add(l);
  }
  return [...set].sort();
}

export interface AuthorDetail {
  id: string;
  full_name: string;
  slug: string;
  bio_html?: string;
  portrait_url?: string;
  /** Crédit imposé par la licence de la photo (Wikimedia Commons). */
  portrait_credit?: string;
  portrait_license?: string;
  portrait_source?: string;
  nationality?: string;
  birth_year?: number;
  death_year?: number;
  website?: string;
  works: {
    role: string;
    role_label: string;
    books: { title: string; slug: string; cover_url?: string; price_paper?: number; year?: number }[];
  }[];
}

export async function getAuthorBySlug(slug: string): Promise<AuthorDetail | null> {
  const rows = await query<any>(
    `SELECT *, portrait.url AS portrait_url, portrait.credit AS portrait_credit,
        portrait.license AS portrait_license, portrait.source_url AS portrait_source
      FROM author WHERE slug = $slug LIMIT 1`,
    { slug }
  );
  const a = rows[0];
  if (!a) return null;

  const works = await query<any>(
    `SELECT role,
        in.title AS title, in.slug AS slug, in.cover.url AS cover_url,
        in.price_paper AS price_paper, in.price_ebook AS price_ebook,
        in.subscription_price AS subscription_price, in.subscription_end AS subscription_end,
        in.stock_qty AS stock_qty, in.status AS status,
        count((SELECT id FROM ebook_asset WHERE book = $parent.in AND status = 'available')) > 0 AS has_ebook_file,
        in.published_at AS published_at
      FROM contributed_by
      WHERE out = $id AND in.status = 'published'
      ORDER BY role`,
    { id: recId('author', a.id) }
  );

  // Préfaces et postfaces forment un seul groupe sur la fiche : même nature de
  // contribution (un texte d'accompagnement), et séparées elles émiettaient la page.
  const cle = (role: string) => (role === 'postface' ? 'preface' : role);
  const byRole = new Map<string, AuthorDetail['works'][number]['books']>();
  for (const w of works) {
    if (!w.title) continue;
    const k = cle(w.role);
    if (!byRole.has(k)) byRole.set(k, []);
    // Préface ET postface du même livre : on ne le montre qu'une fois.
    if (byRole.get(k)!.some((b) => b.slug === w.slug)) continue;
    byRole.get(k)!.push({
      title: w.title,
      slug: w.slug,
      cover_url: w.cover_url ?? undefined,
      price_paper: w.price_paper ?? undefined,
      year: w.published_at ? new Date(w.published_at).getFullYear() : undefined
    });
  }
  const worksGrouped = ROLE_ORDER.filter((r) => byRole.has(r)).map((role) => ({
    role,
    role_label: role === 'preface' ? 'Préfaces & postfaces' : (ROLE_LABEL[role] ?? role),
    books: byRole.get(role)!.sort((x, y) => (y.year ?? 0) - (x.year ?? 0))
  }));

  return {
    id: a.id,
    full_name: a.full_name,
    slug: a.slug,
    bio_html: a.bio_html ?? undefined,
    portrait_url: a.portrait_url ?? undefined,
    portrait_credit: a.portrait_credit ?? undefined,
    portrait_license: a.portrait_license ?? undefined,
    portrait_source: a.portrait_source ?? undefined,
    nationality: a.nationality ?? undefined,
    birth_year: a.birth_year ?? undefined,
    death_year: a.death_year ?? undefined,
    website: a.website ?? undefined,
    works: worksGrouped
  };
}

// ══════════════════════════════════════════════════════════════
// ADMINISTRATION (back-office)
// ══════════════════════════════════════════════════════════════

export async function getAuthorAdmin(id: string) {
  const rows = await query<any>(`SELECT *, portrait.url AS portrait_url FROM author WHERE id = $id LIMIT 1`, { id: recId('author', id) });
  return rows[0] ?? null;
}

/** Fiche auteur (back-office) par slug — inclut l'id brut (pid) et le nb de titres. */
export async function getAuthorAdminBySlug(slug: string) {
  const rows = await query<any>(
    `SELECT *, meta::id(id) AS pid, portrait.url AS portrait_url,
        array::len(array::distinct(<-contributed_by<-book)) AS book_count
      FROM author WHERE slug = $slug LIMIT 1`,
    { slug }
  );
  return rows[0] ?? null;
}

export async function searchAuthorsForPicker(q: string): Promise<{ id: string; full_name: string; slug: string; image?: string }[]> {
  if (!q || !q.trim()) return [];
  return query<any>(
    `SELECT id, full_name, slug, portrait.url AS image FROM author WHERE string::lowercase(full_name) CONTAINS $q ORDER BY full_name ASC LIMIT 12`,
    { q: q.trim().toLowerCase() });
}

export interface AuthorInput {
  first_name: string; last_name: string; bio_html?: string; portraitId?: string; hidden?: boolean;
  nationality?: string; birth_date?: string; death_date?: string; website?: string;
  legal_name?: string; siret?: string;
}

export async function upsertAuthor(id: string | null, d: AuthorInput): Promise<{ id: string; slug: string }> {
  const parts: string[] = ['first_name = $first_name', 'last_name = $last_name', 'hidden = $hidden'];
  const vars: Record<string, unknown> = {
    first_name: d.first_name ?? '', last_name: d.last_name ?? '', hidden: !!d.hidden
  };
  // Optionnels simples : vide → NONE.
  const opt = (field: string, val: unknown) => {
    const empty = val === undefined || val === null || val === '';
    if (empty) parts.push(`${field} = NONE`);
    else { vars[field] = val; parts.push(`${field} = $${field}`); }
  };
  opt('bio_html', d.bio_html);
  opt('nationality', d.nationality);
  opt('website', d.website);
  opt('legal_name', d.legal_name);
  opt('siret', d.siret);
  opt('portrait', d.portraitId ? recId('media', d.portraitId) : undefined);
  // Dates de naissance/décès (+ année dérivée pour l'affichage).
  const dateField = (dateName: string, yearName: string, iso?: string) => {
    const dt = iso ? new Date(iso) : null;
    if (dt && !Number.isNaN(dt.getTime())) {
      vars[dateName] = dt.toISOString();
      parts.push(`${dateName} = type::datetime($${dateName})`);
      vars[yearName] = dt.getUTCFullYear();
      parts.push(`${yearName} = $${yearName}`);
    } else {
      parts.push(`${dateName} = NONE`, `${yearName} = NONE`);
    }
  };
  dateField('birth_date', 'birth_year', d.birth_date);
  dateField('death_date', 'death_year', d.death_date);

  const setSql = parts.join(', ');
  if (id) {
    await query(`UPDATE $id SET ${setSql}`, { ...vars, id: recId('author', id) });
    const s = (await query<any>(`SELECT slug FROM $id`, { id: recId('author', id) }))[0];
    return { id, slug: s?.slug ?? '' };
  }
  const slug = await uniqueSlug('author', `${d.first_name} ${d.last_name}`.trim());
  const rows = await query<any>(`CREATE author SET ${setSql}, slug = $slug`, { ...vars, slug });
  return { id: String(rows[0].id).replace(/^author:/, ''), slug };
}

/** Supprime un auteur — INTERDIT s'il a des titres. Lève 'AUTHOR_HAS_BOOKS' sinon. */
export async function deleteAuthor(id: string) {
  const n = (await query<any>(
    `SELECT array::len(array::distinct(<-contributed_by<-book)) AS n FROM $id`,
    { id: recId('author', id) }
  ))[0]?.n ?? 0;
  if (n > 0) throw new Error('AUTHOR_HAS_BOOKS');
  await query(`DELETE contributed_by WHERE out = $id`, { id: recId('author', id) });
  await query(`DELETE $id`, { id: recId('author', id) });
}

export interface AuthorBookAdmin {
  book_id: string;
  title: string;
  slug: string;
  status: string;
  cover_url?: string;
  isbn_paper?: string;
  role: string;
  role_label: string;
  share?: number;
  year?: number;
}

/**
 * Titres auxquels un contributeur a travaillé (back-office) — l'inverse du bloc
 * « Contributeurs » de la fiche livre : on part de l'auteur et on remonte l'arête.
 * Tous statuts confondus (brouillons inclus), avec le rôle et la part qui
 * serviront au calcul des droits.
 */
export async function booksForAuthorAdmin(authorId: string): Promise<AuthorBookAdmin[]> {
  const rows = await query<any>(
    `SELECT role, share,
        meta::id(in.id) AS book_id, in.title AS title, in.slug AS slug,
        in.status AS status, in.cover.url AS cover_url,
        in.isbn_paper AS isbn_paper, in.published_at AS published_at
      FROM contributed_by WHERE out = $id`,
    { id: recId('author', authorId) }
  );
  const rank = (r: string) => {
    const i = (ROLE_ORDER as readonly string[]).indexOf(r);
    return i < 0 ? ROLE_ORDER.length : i;
  };
  return rows
    .filter((r) => r.title)
    .map((r) => ({
      book_id: r.book_id,
      title: r.title,
      slug: r.slug,
      status: r.status ?? 'draft',
      cover_url: r.cover_url ?? undefined,
      isbn_paper: r.isbn_paper ?? undefined,
      role: r.role,
      role_label: ROLE_LABEL[r.role] ?? r.role,
      share: typeof r.share === 'number' ? r.share : undefined,
      year: r.published_at ? new Date(r.published_at).getFullYear() : undefined
    }))
    .sort((a, b) => rank(a.role) - rank(b.role) || (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title, 'fr'));
}

/* ————————————————————— Back-office : vue d'ensemble « Auteurs & Co » ————————————————————— */

export interface AuthorOverviewRow {
  id: string; slug: string; first_name: string; last_name: string; full_name: string;
  portrait_url?: string; hidden: boolean;
  livres: number; prefaces: number; postfaces: number; traductions: number; contributions: number;
  articles: number; rencontres: number;
  /** Première participation connue (livre paru, article publié, rencontre) — base de l'ancienneté. */
  depuis?: string;
}

/**
 * Tous les contributeurs avec leurs compteurs, en QUATRE requêtes agrégées côté
 * serveur (au lieu d'une sous-requête par auteur × 1 000 auteurs). La liste
 * (~1 000 lignes) part en entier au client : recherche, filtres, tri, pagination
 * et export y sont instantanés.
 */
export async function listAuthorsOverview(): Promise<AuthorOverviewRow[]> {
  const [authors, contribs, articles, events] = await Promise.all([
    query<any>(`SELECT meta::id(id) AS id, slug, first_name, last_name, full_name, hidden, portrait.url AS portrait_url FROM author`),
    query<any>(`SELECT meta::id(out) AS a, meta::id(in) AS b, role, in.published_at AS d, in.status AS s FROM contributed_by`),
    query<any>(`SELECT authors, published_at, status FROM article WHERE array::len(authors ?? []) > 0`),
    query<any>(`SELECT authors, start_at FROM event WHERE array::len(authors ?? []) > 0`)
  ]);
  const nu = (x: unknown) => String(x ?? '').replace(/^author:/, '');
  const stats = new Map<string, Omit<AuthorOverviewRow, 'id' | 'slug' | 'first_name' | 'last_name' | 'full_name' | 'portrait_url' | 'hidden'> & { livresVus: Set<string> }>();
  const st = (id: string) => {
    let s = stats.get(id);
    if (!s) stats.set(id, (s = { livres: 0, prefaces: 0, postfaces: 0, traductions: 0, contributions: 0, articles: 0, rencontres: 0, depuis: undefined, livresVus: new Set() }));
    return s;
  };
  const date = (s: { depuis?: string }, d?: string | null) => { if (d && (!s.depuis || d < s.depuis)) s.depuis = d; };

  for (const c of contribs) {
    const s = st(nu(c.a));
    // Un livre compte une fois par rôle (doublons d'arêtes possibles après migration).
    const cle = `${c.role}:${c.b}`;
    if (s.livresVus.has(cle)) continue;
    s.livresVus.add(cle);
    if (c.role === 'author') s.livres++;
    else if (c.role === 'preface') s.prefaces++;
    else if (c.role === 'postface') s.postfaces++;
    else if (c.role === 'translator') s.traductions++;
    else s.contributions++;
    // Ancienneté : seuls les livres réellement parus comptent (pas les brouillons ni l'à-paraître).
    if (c.s === 'published' && c.d && c.d <= new Date().toISOString()) date(s, c.d);
  }
  for (const a of articles) for (const id of a.authors ?? []) {
    const s = st(nu(id));
    s.articles++;
    if (a.status === 'published') date(s, a.published_at);
  }
  for (const e of events) for (const id of e.authors ?? []) {
    const s = st(nu(id));
    s.rencontres++;
    if (e.start_at && e.start_at <= new Date().toISOString()) date(s, e.start_at);
  }

  return authors
    .map((a) => {
      const { livresVus: _v, ...s } = st(a.id);
      return {
        id: a.id, slug: a.slug, first_name: a.first_name ?? '', last_name: a.last_name ?? '',
        full_name: a.full_name ?? '', portrait_url: a.portrait_url ?? undefined, hidden: a.hidden === true, ...s
      };
    })
    .sort((x, y) => (x.last_name || x.full_name).localeCompare(y.last_name || y.full_name, 'fr', { sensitivity: 'base' }));
}
