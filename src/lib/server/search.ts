/**
 * Recherche transversale du site (livres, auteurs, articles, rencontres)
 * — utilisée par la modale de recherche et la page /recherche.
 */
import { query } from './surreal';
import { deburr, accentRegex } from '$lib/text';

export interface SearchResults {
  books: { title: string; slug: string; cover_url?: string; author?: string }[];
  authors: { full_name: string; slug: string }[];
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
      `SELECT full_name, slug FROM author
         WHERE hidden != true AND string::matches(full_name, $re)
         ORDER BY full_name ASC LIMIT $lim`, vars),
    query<any>(
      `SELECT title, slug, published_at, rubrique.name AS rubrique FROM article
         WHERE status = 'published' AND string::matches(title, $re)
         ORDER BY published_at DESC LIMIT $lim`, vars),
    query<any>(
      `SELECT title, slug, start_at, venue.city AS venue_city FROM event
         WHERE string::matches(title, $re)
         ORDER BY start_at DESC LIMIT $lim`, vars)
  ]);
  const now = Date.now();
  return {
    books: books.map((b) => ({ title: b.title, slug: b.slug, cover_url: b.cover_url ?? undefined, author: (b.a_names ?? [])[0] ?? undefined })),
    authors: authors.map((a) => ({ full_name: a.full_name, slug: a.slug })),
    articles: articles.map((a) => ({ title: a.title, slug: a.slug, rubrique: a.rubrique ?? undefined, published_at: a.published_at ?? undefined })),
    events: events.map((e) => ({
      title: e.title, slug: e.slug, start_at: e.start_at ?? undefined, venue_city: e.venue_city ?? undefined,
      upcoming: e.start_at ? new Date(e.start_at).getTime() > now : false
    }))
  };
}
