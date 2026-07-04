/**
 * Auteurs (contributeurs) — index & fiche.
 * book ->contributed_by-> author : depuis un auteur, on remonte ses livres via
 * l'arête inverse `<-contributed_by<-book`.
 */
import { query, recId } from './surreal';
import { uniqueSlug } from './slug';
import { ROLE_LABEL, ROLE_ORDER } from '$lib/labels';

export interface AuthorCard {
  id: string;
  full_name: string;
  slug: string;
  last_name: string;
  book_count: number;
}

export async function listAuthors(opts: { q?: string; letter?: string } = {}): Promise<AuthorCard[]> {
  const where = ['hidden = false', 'array::len(<-contributed_by<-book) > 0'];
  const vars: Record<string, unknown> = {};
  if (opts.letter && /^[a-z]$/i.test(opts.letter)) {
    vars.letter = opts.letter.toLowerCase();
    where.push('string::starts_with(string::lowercase(last_name), $letter)');
  }
  if (opts.q && opts.q.trim()) {
    vars.q = opts.q.trim().toLowerCase();
    where.push('string::lowercase(full_name) CONTAINS $q');
  }
  const rows = await query<any>(
    `SELECT id, full_name, slug, last_name, first_name,
        array::len(array::distinct(<-contributed_by<-book)) AS book_count
      FROM author WHERE ${where.join(' AND ')}
      ORDER BY last_name ASC, first_name ASC`,
    vars
  );
  return rows.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    slug: r.slug,
    last_name: r.last_name ?? '',
    book_count: r.book_count ?? 0
  }));
}

/** Lettres de l'alphabet effectivement présentes (pour l'index A–Z). */
export async function authorInitials(): Promise<string[]> {
  const rows = await query<any>(
    `SELECT string::uppercase(string::slice(last_name, 0, 1)) AS l
       FROM author WHERE hidden = false AND array::len(<-contributed_by<-book) > 0`
  );
  const set = new Set<string>();
  for (const r of rows) if (r.l && /^[A-Z]$/.test(r.l)) set.add(r.l);
  return [...set].sort();
}

export interface AuthorDetail {
  id: string;
  full_name: string;
  slug: string;
  bio_html?: string;
  portrait_url?: string;
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
    `SELECT *, portrait.url AS portrait_url FROM author WHERE slug = $slug LIMIT 1`,
    { slug }
  );
  const a = rows[0];
  if (!a) return null;

  const works = await query<any>(
    `SELECT role,
        in.title AS title, in.slug AS slug, in.cover.url AS cover_url,
        in.price_paper AS price_paper, in.published_at AS published_at
      FROM contributed_by
      WHERE out = $id AND in.status = 'published'
      ORDER BY role`,
    { id: recId('author', a.id) }
  );

  const byRole = new Map<string, AuthorDetail['works'][number]['books']>();
  for (const w of works) {
    if (!w.title) continue;
    if (!byRole.has(w.role)) byRole.set(w.role, []);
    byRole.get(w.role)!.push({
      title: w.title,
      slug: w.slug,
      cover_url: w.cover_url ?? undefined,
      price_paper: w.price_paper ?? undefined,
      year: w.published_at ? new Date(w.published_at).getFullYear() : undefined
    });
  }
  const worksGrouped = ROLE_ORDER.filter((r) => byRole.has(r)).map((role) => ({
    role,
    role_label: ROLE_LABEL[role] ?? role,
    books: byRole.get(role)!.sort((x, y) => (y.year ?? 0) - (x.year ?? 0))
  }));

  return {
    id: a.id,
    full_name: a.full_name,
    slug: a.slug,
    bio_html: a.bio_html ?? undefined,
    portrait_url: a.portrait_url ?? undefined,
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

export async function listAuthorsAdmin(opts: { q?: string; limit?: number; offset?: number } = {}) {
  const where: string[] = [];
  const vars: Record<string, unknown> = { limit: opts.limit ?? 60, start: opts.offset ?? 0 };
  if (opts.q && opts.q.trim()) { vars.q = opts.q.trim().toLowerCase(); where.push('string::lowercase(full_name) CONTAINS $q'); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await query<any>(
    `SELECT id, full_name, slug, last_name, first_name, hidden,
        array::len(array::distinct(<-contributed_by<-book)) AS book_count
      FROM author ${whereSql} ORDER BY last_name ASC, first_name ASC LIMIT $limit START $start`, vars);
  const count = await query<any>(`SELECT count() AS n FROM author ${whereSql} GROUP ALL`, vars);
  return { authors: rows, total: count[0]?.n ?? 0 };
}

export async function getAuthorAdmin(id: string) {
  const rows = await query<any>(`SELECT *, portrait.url AS portrait_url FROM author WHERE id = $id LIMIT 1`, { id: recId('author', id) });
  return rows[0] ?? null;
}

export async function searchAuthorsForPicker(q: string): Promise<{ id: string; full_name: string }[]> {
  if (!q || !q.trim()) return [];
  return query<any>(
    `SELECT id, full_name FROM author WHERE string::lowercase(full_name) CONTAINS $q ORDER BY full_name ASC LIMIT 12`,
    { q: q.trim().toLowerCase() });
}

export interface AuthorInput {
  first_name: string; last_name: string; bio_html?: string; portraitId?: string; hidden?: boolean;
  nationality?: string; birth_year?: number; death_year?: number; website?: string;
  legal_name?: string; siret?: string;
}

export async function upsertAuthor(id: string | null, d: AuthorInput): Promise<string> {
  const fields: Record<string, unknown> = {
    first_name: d.first_name ?? '', last_name: d.last_name ?? '', hidden: !!d.hidden,
    bio_html: d.bio_html, nationality: d.nationality, birth_year: d.birth_year,
    death_year: d.death_year, website: d.website, legal_name: d.legal_name, siret: d.siret,
    portrait: d.portraitId ? recId('media', d.portraitId) : undefined
  };
  const parts: string[] = [];
  const vars: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    const empty = v === undefined || v === null || v === '' || (typeof v === 'number' && Number.isNaN(v));
    if (empty) parts.push(`${k} = NONE`);
    else { vars[k] = v; parts.push(`${k} = $${k}`); }
  }
  const setSql = parts.join(', ');
  if (id) { await query(`UPDATE $id SET ${setSql}`, { ...vars, id: recId('author', id) }); return id; }
  const slug = await uniqueSlug('author', `${d.first_name} ${d.last_name}`.trim());
  const rows = await query<any>(`CREATE author SET ${setSql}, slug = $slug`, { ...vars, slug });
  return String(rows[0].id).replace(/^author:/, '');
}

export async function deleteAuthor(id: string) {
  await query(`DELETE contributed_by WHERE out = $id`, { id: recId('author', id) });
  await query(`DELETE $id`, { id: recId('author', id) });
}
