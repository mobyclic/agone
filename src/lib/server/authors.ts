/**
 * Auteurs (contributeurs) — index & fiche.
 * book ->contributed_by-> author : depuis un auteur, on remonte ses livres via
 * l'arête inverse `<-contributed_by<-book`.
 */
import { query, recId } from './surreal';
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
