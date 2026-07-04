import type { PageServerLoad } from './$types';
import { listBooks } from '$lib/server/catalogue';
import { listAuthors } from '$lib/server/authors';
import { listArticles } from '$lib/server/articles';

export const load: PageServerLoad = async ({ url }) => {
  const q = (url.searchParams.get('q') ?? '').trim();
  if (!q) return { q: '', books: [], authors: [], articles: [] };
  const [b, authors, a] = await Promise.all([
    listBooks({ q, limit: 12 }),
    listAuthors({ q }),
    listArticles({ q, limit: 8 })
  ]);
  return { q, books: b.books, authors: authors.slice(0, 15), articles: a.articles };
};
