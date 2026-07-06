/**
 * L'Antichambre — articles éditoriaux + rubriques.
 */
import { query, recId } from './surreal';
import { uniqueSlug } from './slug';

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
  views: number;
  /** Résumé texte plus long, coupé en fin de mot (manchette d'accueil). */
  summary?: string;
}

/** HTML → texte brut (décode les entités, supprime les balises, normalise les espaces). */
function htmlToText(html: string): string {
  return html
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
}

/** Coupe une chaîne à maxLen en FIN DE MOT et ajoute « … ». */
function cutAtWord(text: string, maxLen: number): string {
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  const base = (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.…«»–—-]+$/u, '');
  return `${base} …`;
}

/**
 * Coupe « propre » à maxLen : de préférence en FIN DE PHRASE (dernier
 * « . ! ? … » passé la moitié, ponctuation conservée), sinon en FIN DE MOT + « … ».
 */
function truncateClean(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const sentence = Math.max(
    cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('… ')
  );
  if (sentence > maxLen * 0.5) return cut.slice(0, sentence + 1).trim();
  return cutAtWord(text, maxLen);
}

/** Résumé en texte brut depuis le HTML, tronqué proprement en FIN DE MOT. */
function plainSummary(html?: string, maxLen = 360): string | undefined {
  if (!html) return undefined;
  const text = htmlToText(html);
  if (!text) return undefined;
  return text.length <= maxLen ? text : cutAtWord(text, maxLen);
}

/**
 * Accroche en GRAS du début d'article (le chapô en <strong>/<b>).
 * Capture les runs gras contigus au tout début du 1er paragraphe, jusqu'au
 * premier texte non gras. undefined si pas d'accroche substantielle (≥ 30 car.).
 */
function boldLead(html: string, maxLen = 600): string | undefined {
  const p = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
  let seg = (p ? p[1] : html).replace(/^(?:\s|&nbsp;|<br\s*\/?>)+/i, '');
  const parts: string[] = [];
  const boldRe = /^<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/i;
  let m: RegExpExecArray | null;
  while ((m = boldRe.exec(seg))) {
    parts.push(m[2]);
    seg = seg.slice(m[0].length).replace(/^(?:\s|&nbsp;|<br\s*\/?>)+/i, '');
  }
  if (!parts.length) return undefined;
  const text = htmlToText(parts.join(' '));
  if (text.length < 30) return undefined; // simple mot/nom en gras : on ignore
  return truncateClean(text, maxLen);
}

/**
 * Résumé « propre » d'au plus maxLen caractères : coupe de préférence en FIN
 * DE PHRASE (dernier « . ! ? … » passé la moitié), sinon en FIN DE MOT + « … ».
 */
function cleanSummary(html: string, maxLen = 500): string | undefined {
  const text = htmlToText(html);
  if (!text) return undefined;
  return truncateClean(text, maxLen);
}

/** Accroche de la manchette d'accueil : le gras de début, sinon ~500 car. propres. */
function articleLede(html?: string): string | undefined {
  if (!html) return undefined;
  return boldLead(html) ?? cleanSummary(html, 500);
}

const CARD = `
  title, slug, excerpt, published_at, cover.url AS cover_url,
  rubrique.name AS rubrique_name, rubrique.slug AS rubrique_slug,
  authors.full_name AS author_names, is_newsletter_issue, views
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
    is_newsletter_issue: r.is_newsletter_issue ?? false,
    views: r.views ?? 0
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

/** Incrémente le compteur de vues d'un article (appelé côté client à l'affichage). */
export async function incrementArticleViews(slug: string): Promise<void> {
  await query(`UPDATE article SET views += 1 WHERE slug = $s`, { s: slug });
}

/**
 * Article de la manchette d'accueil : le dernier article SIGNÉ (auteur présent),
 * lettres d'info comprises — elles sont signées et souvent les plus récentes.
 * Repli sur le dernier article publié si aucun n'est signé. Le suffixe
 * « [LettrInfo NN] » est retiré du titre pour un hero propre.
 */
export async function latestArticle(): Promise<ArticleCard | null> {
  const base = `SELECT ${CARD}, body_html FROM article WHERE status = 'published'`;
  let rows = await query<any>(`${base} AND array::len(authors ?? []) > 0 ORDER BY published_at DESC LIMIT 1`);
  if (!rows[0]) rows = await query<any>(`${base} ORDER BY published_at DESC LIMIT 1`);
  if (!rows[0]) return null;
  const card = toCard(rows[0]);
  card.title = card.title.replace(/\s*\[LettrInfos?\b[^\]]*\]\s*$/i, '').trim();
  card.summary = articleLede(rows[0].body_html) ?? card.excerpt;
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
  id: string;
  body_html?: string;
  authors: { full_name: string; slug: string }[];
  books: { title: string; slug: string }[];
}

export async function getArticleBySlug(slug: string): Promise<ArticleDetail | null> {
  const rows = await query<any>(
    `SELECT ${CARD}, meta::id(id) AS pid, body_html,
        authors.{ full_name: full_name, slug: slug } AS authors,
        books.{ title: title, slug: slug } AS books
      FROM article WHERE slug = $slug LIMIT 1`,
    { slug }
  );
  const a = rows[0];
  if (!a) return null;
  return {
    ...toCard(a),
    id: a.pid,
    body_html: a.body_html ?? undefined,
    authors: (a.authors ?? []).filter((x: any) => x?.slug),
    books: (a.books ?? []).filter((x: any) => x?.slug)
  };
}

/* ————————————————————— Back-office : contenu ————————————————————— */

/** SET dynamique : valeur vide → NONE (efface le champ optionnel). */
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

const plainId = (v: unknown, table: string) => String(v ?? '').replace(new RegExp(`^${table}:`), '');

export interface AdminArticleRow {
  id: string; title: string; slug: string; status: string;
  published_at?: string; is_newsletter_issue: boolean; rubrique_name?: string; author?: string; views: number;
}

/** Liste paginée des articles (tous statuts) pour le back-office. */
export async function listArticlesAdmin(opts: { q?: string; rubrique?: string; status?: string; limit?: number; offset?: number } = {}): Promise<{ articles: AdminArticleRow[]; total: number }> {
  const where: string[] = [];
  const vars: Record<string, unknown> = { limit: opts.limit ?? 50, start: opts.offset ?? 0 };
  if (opts.status) { where.push('status = $status'); vars.status = opts.status; }
  if (opts.rubrique) { where.push('rubrique.slug = $rub'); vars.rub = opts.rubrique; }
  if (opts.q && opts.q.trim()) { vars.q = opts.q.trim().toLowerCase(); where.push('string::lowercase(title) CONTAINS $q'); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await query<any>(
    `SELECT id, title, slug, status, published_at, is_newsletter_issue, views,
        rubrique.name AS rubrique_name, authors.full_name AS author_names
      FROM article ${whereSql} ORDER BY published_at DESC LIMIT $limit START $start`,
    vars
  );
  const count = await query<any>(`SELECT count() AS n FROM article ${whereSql} GROUP ALL`, vars);
  const articles = rows.map((r) => ({
    id: plainId(r.id, 'article'), title: r.title, slug: r.slug, status: r.status,
    published_at: r.published_at ?? undefined, is_newsletter_issue: r.is_newsletter_issue ?? false,
    rubrique_name: r.rubrique_name ?? undefined, author: (r.author_names ?? [])[0] ?? undefined, views: r.views ?? 0
  }));
  return { articles, total: count[0]?.n ?? 0 };
}

export interface ArticleEdit {
  id: string; title: string; slug: string; status: string;
  excerpt?: string; body_html?: string; is_newsletter_issue: boolean;
  published_at?: string; rubrique_id?: string; cover_url?: string; cover_id?: string;
  authors: { id: string; label: string }[];
  books: { id: string; label: string }[];
}

export async function getArticleForEdit(id: string): Promise<ArticleEdit | null> {
  const rows = await query<any>(
    `SELECT id, title, slug, status, excerpt, body_html, is_newsletter_issue, published_at,
        rubrique AS rubrique_id, cover.url AS cover_url, cover AS cover_id,
        authors.{ id: id, label: full_name } AS authors,
        books.{ id: id, label: title } AS books
      FROM article WHERE id = $id LIMIT 1`,
    { id: recId('article', id) }
  );
  const a = rows[0];
  if (!a) return null;
  return {
    id: plainId(a.id, 'article'), title: a.title, slug: a.slug, status: a.status,
    excerpt: a.excerpt ?? undefined, body_html: a.body_html ?? undefined,
    is_newsletter_issue: a.is_newsletter_issue ?? false, published_at: a.published_at ?? undefined,
    rubrique_id: a.rubrique_id ? plainId(a.rubrique_id, 'rubrique') : undefined,
    cover_url: a.cover_url ?? undefined, cover_id: a.cover_id ? plainId(a.cover_id, 'media') : undefined,
    authors: (a.authors ?? []).filter((x: any) => x?.id).map((x: any) => ({ id: String(x.id), label: x.label ?? '—' })),
    books: (a.books ?? []).filter((x: any) => x?.id).map((x: any) => ({ id: String(x.id), label: x.label ?? '—' }))
  };
}

export interface ArticleInput {
  title: string; slug?: string; status?: string; body_html?: string;
  is_newsletter_issue?: boolean; published_at?: string; rubriqueId?: string; coverId?: string;
  authorIds?: string[]; bookIds?: string[];
}

export async function saveArticle(id: string | null, d: ArticleInput): Promise<string> {
  const { sql, vars } = buildSet({
    title: d.title,
    status: d.status || 'draft',
    excerpt: plainSummary(d.body_html, 240) ?? undefined, // accroche auto-dérivée du corps
    body_html: d.body_html,
    is_newsletter_issue: !!d.is_newsletter_issue,
    published_at: d.published_at ? new Date(d.published_at) : undefined,
    rubrique: d.rubriqueId ? recId('rubrique', d.rubriqueId) : undefined,
    cover: d.coverId ? recId('media', d.coverId) : undefined,
    authors: d.authorIds ? d.authorIds.map((x) => recId('author', x)) : undefined,
    books: d.bookIds ? d.bookIds.map((x) => recId('book', x)) : undefined
  });
  if (id) {
    if (d.slug) {
      const slug = await uniqueSlug('article', d.slug, { excludeId: id });
      await query(`UPDATE $id SET ${sql}, slug = $slug`, { ...vars, id: recId('article', id), slug });
    } else {
      await query(`UPDATE $id SET ${sql}`, { ...vars, id: recId('article', id) });
    }
    return id;
  }
  const slug = await uniqueSlug('article', d.slug || d.title);
  const rows = await query<any>(`CREATE article SET ${sql}, slug = $slug`, { ...vars, slug });
  return plainId(rows[0].id, 'article');
}

export async function deleteArticle(id: string): Promise<void> {
  await query(`DELETE $id`, { id: recId('article', id) });
}

/* ————————————————————— Rubriques (édition) ————————————————————— */

export interface AdminRubrique { id: string; name: string; slug: string; kind: string; sort: number; count: number }

export async function listAllRubriques(): Promise<AdminRubrique[]> {
  const rubs = await query<any>(`SELECT id, name, slug, kind, sort FROM rubrique ORDER BY sort ASC, name ASC`);
  const counts = await query<any>(`SELECT rubrique AS r, count() AS n FROM article WHERE rubrique != NONE GROUP BY rubrique`);
  const byR = new Map<string, number>();
  for (const c of counts) if (c.r) byR.set(String(c.r), c.n ?? 0);
  return rubs.map((r) => ({
    id: plainId(r.id, 'rubrique'), name: r.name, slug: r.slug, kind: r.kind ?? 'both',
    sort: r.sort ?? 0, count: byR.get(String(r.id)) ?? 0
  }));
}

export async function saveRubrique(id: string | null, d: { name: string; slug?: string; kind?: string; sort?: number }): Promise<string> {
  const { sql, vars } = buildSet({ name: d.name, kind: d.kind || 'blog', sort: d.sort ?? 0 });
  if (id) {
    if (d.slug) {
      const slug = await uniqueSlug('rubrique', d.slug, { excludeId: id });
      await query(`UPDATE $id SET ${sql}, slug = $slug`, { ...vars, id: recId('rubrique', id), slug });
    } else {
      await query(`UPDATE $id SET ${sql}`, { ...vars, id: recId('rubrique', id) });
    }
    return id;
  }
  const slug = await uniqueSlug('rubrique', d.slug || d.name);
  const rows = await query<any>(`CREATE rubrique SET ${sql}, slug = $slug`, { ...vars, slug });
  return plainId(rows[0].id, 'rubrique');
}

export async function deleteRubrique(id: string): Promise<void> {
  await query(`UPDATE article SET rubrique = NONE WHERE rubrique = $id`, { id: recId('rubrique', id) });
  await query(`DELETE $id`, { id: recId('rubrique', id) });
}
