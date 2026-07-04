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
  /** Résumé texte plus long, coupé en fin de mot (manchette d'accueil). */
  summary?: string;
}

/** Résumé en texte brut depuis le HTML, tronqué proprement en FIN DE MOT. */
function plainSummary(html?: string, maxLen = 360): string | undefined {
  if (!html) return undefined;
  const text = html
    .replace(/<\/?(strong|em|b|i|u|sup|sub|span|a|mark|small|code)\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#8217;|&rsquo;/g, '’')
    .replace(/&#8230;|&hellip;/g, '…')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return undefined;
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  const base = (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.…«»–—-]+$/u, '');
  return `${base} …`;
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

/**
 * Article de la manchette d'accueil : le dernier article SIGNÉ (auteur présent),
 * lettres d'info comprises — elles sont signées et souvent les plus récentes.
 * Repli sur le dernier article publié si aucun n'est signé. Le suffixe
 * « [LettrInfo NN] » est retiré du titre pour un hero propre.
 */
export async function latestArticle(): Promise<ArticleCard | null> {
  const base = `SELECT ${CARD}, body_html FROM article WHERE status = 'published'`;
  let rows = await query<any>(`${base} AND array::len(authors) > 0 ORDER BY published_at DESC LIMIT 1`);
  if (!rows[0]) rows = await query<any>(`${base} ORDER BY published_at DESC LIMIT 1`);
  if (!rows[0]) return null;
  const card = toCard(rows[0]);
  card.title = card.title.replace(/\s*\[LettrInfos?\b[^\]]*\]\s*$/i, '').trim();
  card.summary = plainSummary(rows[0].body_html, 720) ?? card.excerpt;
  return card;
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
