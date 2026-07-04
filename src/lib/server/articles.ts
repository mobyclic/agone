/**
 * L'Antichambre — articles éditoriaux + rubriques.
 */
import { query } from './surreal';

export interface ArticleCard {
  title: string;
  slug: string;
  excerpt?: string;
  published_at?: string;
  cover_url?: string;
  rubrique_name?: string;
  rubrique_slug?: string;
  author?: string;
  is_newsletter_issue: boolean;
}

const CARD = `
  title, slug, excerpt, published_at, cover.url AS cover_url,
  rubrique.name AS rubrique_name, rubrique.slug AS rubrique_slug,
  authors.full_name AS author_names, is_newsletter_issue
`;

function toCard(r: any): ArticleCard {
  return {
    title: r.title,
    slug: r.slug,
    excerpt: r.excerpt ?? undefined,
    published_at: r.published_at ?? undefined,
    cover_url: r.cover_url ?? undefined,
    rubrique_name: r.rubrique_name ?? undefined,
    rubrique_slug: r.rubrique_slug ?? undefined,
    author: (r.author_names ?? [])[0] ?? undefined,
    is_newsletter_issue: r.is_newsletter_issue ?? false
  };
}

export async function listArticles(opts: { rubrique?: string; q?: string; limit?: number; offset?: number } = {}): Promise<{ articles: ArticleCard[]; total: number }> {
  const where = [`status = 'published'`];
  const vars: Record<string, unknown> = { limit: opts.limit ?? 20, start: opts.offset ?? 0 };
  if (opts.rubrique) { where.push('rubrique.slug = $rub'); vars.rub = opts.rubrique; }
  if (opts.q && opts.q.trim()) { vars.q = opts.q.trim().toLowerCase(); where.push('string::lowercase(title) CONTAINS $q'); }
  const whereSql = where.join(' AND ');
  const rows = await query<any>(
    `SELECT ${CARD} FROM article WHERE ${whereSql} ORDER BY published_at DESC LIMIT $limit START $start`,
    vars
  );
  const count = await query<any>(`SELECT count() AS n FROM article WHERE ${whereSql} GROUP ALL`, vars);
  return { articles: rows.map(toCard), total: count[0]?.n ?? 0 };
}

export async function recentArticles(limit = 6): Promise<ArticleCard[]> {
  const rows = await query<any>(`SELECT ${CARD} FROM article WHERE status = 'published' ORDER BY published_at DESC LIMIT $limit`, { limit });
  return rows.map(toCard);
}

/** Dernier article éditorial (hors lettres d'info) — pour la manchette de l'accueil. */
export async function latestArticle(): Promise<ArticleCard | null> {
  const rows = await query<any>(
    `SELECT ${CARD} FROM article WHERE status = 'published' AND is_newsletter_issue != true ORDER BY published_at DESC LIMIT 1`
  );
  return rows[0] ? toCard(rows[0]) : null;
}

export interface RubriqueInfo { id: string; name: string; slug: string; count: number }

export async function listBlogRubriques(): Promise<RubriqueInfo[]> {
  const rubs = await query<any>(`SELECT id, name, slug, sort FROM rubrique ORDER BY sort ASC`);
  const counts = await query<any>(`SELECT rubrique AS r, count() AS n FROM article WHERE rubrique != NONE GROUP BY rubrique`);
  const byR = new Map<string, number>();
  for (const c of counts) if (c.r) byR.set(String(c.r), c.n ?? 0);
  return rubs
    .map((r) => ({ id: r.id, name: r.name, slug: r.slug, count: byR.get(String(r.id)) ?? 0 }))
    .filter((r) => r.count > 0);
}

export interface ArticleDetail extends ArticleCard {
  body_html?: string;
  authors: { full_name: string; slug: string }[];
  books: { title: string; slug: string }[];
}

export async function getArticleBySlug(slug: string): Promise<ArticleDetail | null> {
  const rows = await query<any>(
    `SELECT ${CARD}, body_html,
        authors.{ full_name: full_name, slug: slug } AS authors,
        books.{ title: title, slug: slug } AS books
      FROM article WHERE slug = $slug LIMIT 1`,
    { slug }
  );
  const a = rows[0];
  if (!a) return null;
  return {
    ...toCard(a),
    body_html: a.body_html ?? undefined,
    authors: (a.authors ?? []).filter((x: any) => x?.slug),
    books: (a.books ?? []).filter((x: any) => x?.slug)
  };
}
