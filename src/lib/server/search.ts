/**
 * Recherche transversale du site (livres, auteurs, articles, rencontres)
 * — utilisée par la modale de recherche et la page /recherche.
 */
import { query, recId } from './surreal';
import { deburr, accentRegex } from '$lib/text';
import { ARTICLE_EN_LIGNE } from './articles';
import { auteursAvecContenu } from './authors';

export interface SearchResults {
  books: { title: string; slug: string; cover_url?: string; author?: string }[];
  authors: { full_name: string; slug: string; portrait_url?: string }[];
  articles: { title: string; slug: string; rubrique?: string; published_at?: string }[];
  events: { title: string; slug: string; start_at?: string; venue_city?: string; upcoming: boolean }[];
}

export async function siteSearch(qRaw: string, perType = 6): Promise<SearchResults> {
  const q = deburr((qRaw ?? '').trim());
  if (q.length < 2) return { books: [], authors: [], articles: [], events: [] };
  const vars = { re: accentRegex(qRaw), lim: perType };
  const [books, authors, articles, events] = await Promise.all([
    query<any>(
      `SELECT title, slug, published_at, cover.url AS cover_url, ->contributed_by[WHERE role = 'author']->author.full_name AS a_names
         FROM book WHERE status = 'published' AND string::matches(title, $re)
         ORDER BY published_at DESC LIMIT $lim`, vars),
    query<any>(
      // Large d'abord (40), filtré ensuite : les fiches sans livre, article ni
      // rencontre sont écartées, puis on garde les `perType` premières.
      `SELECT id, full_name, slug, portrait.url AS portrait_url FROM author
         WHERE hidden != true AND string::matches(full_name, $re)
         ORDER BY full_name ASC LIMIT 40`, vars),
    query<any>(
      `SELECT title, slug, published_at, rubrique.name AS rubrique FROM article
         WHERE ${ARTICLE_EN_LIGNE} AND string::matches(title, $re)
         ORDER BY published_at DESC LIMIT $lim`, vars),
    query<any>(
      // Rencontres : seulement celles à venir, les plus proches d'abord.
      `SELECT title, slug, start_at, venue.city AS venue_city FROM event
         WHERE string::matches(title, $re) AND start_at != NONE AND start_at >= time::now()
         ORDER BY start_at ASC LIMIT $lim`, vars)
  ]);
  const actifs = await auteursAvecContenu(authors.map((a) => String(a.id)));
  const auteursUtiles = authors.filter((a) => actifs.has(String(a.id))).slice(0, perType);
  // Un auteur reconnu ⇒ ses livres rejoignent les résultats (après ceux dont le titre correspond).
  const livres = books.map((b) => ({ title: b.title, slug: b.slug, cover_url: b.cover_url ?? undefined, author: (b.a_names ?? [])[0] ?? undefined }));
  if (auteursUtiles.length && livres.length < perType) {
    const desAuteurs = await query<any>(
      `SELECT title, slug, published_at, cover.url AS cover_url, ->contributed_by[WHERE role = 'author']->author.full_name AS a_names
         FROM book WHERE status = 'published'
           AND id IN (SELECT VALUE in FROM contributed_by WHERE out IN $ids AND role = 'author')
         ORDER BY published_at DESC LIMIT $lim`,
      // query() renvoie les RecordId en « author:id » : on repasse par recId() pour la comparaison.
      { ids: auteursUtiles.map((a) => recId('author', String(a.id).replace(/^author:/, ''))), lim: perType }
    );
    const vus = new Set(livres.map((b) => b.slug));
    for (const b of desAuteurs) {
      if (livres.length >= perType) break;
      if (vus.has(b.slug)) continue;
      vus.add(b.slug);
      livres.push({ title: b.title, slug: b.slug, cover_url: b.cover_url ?? undefined, author: (b.a_names ?? [])[0] ?? undefined });
    }
  }
  const now = Date.now();
  return {
    books: livres,
    authors: auteursUtiles.map((a) => ({ full_name: a.full_name, slug: a.slug, portrait_url: a.portrait_url ?? undefined })),
    articles: articles.map((a) => ({ title: a.title, slug: a.slug, rubrique: a.rubrique ?? undefined, published_at: a.published_at ?? undefined })),
    events: events.map((e) => ({
      title: e.title, slug: e.slug, start_at: e.start_at ?? undefined, venue_city: e.venue_city ?? undefined,
      upcoming: e.start_at ? new Date(e.start_at).getTime() > now : false
    }))
  };
}
