import type { PageServerLoad } from './$types';
import { listBooks, collectionsWithBooks, countPublishedBooks } from '$lib/server/catalogue';

const LIMIT = 24;

export const load: PageServerLoad = async ({ url }) => {
  const q = (url.searchParams.get('q') ?? '').trim();

  // Recherche → grille de résultats à plat.
  if (q) {
    const sort = (url.searchParams.get('sort') as 'recent' | 'title' | 'price_asc') ?? 'recent';
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
    const { books, total } = await listBooks({ q, sort, limit: LIMIT, offset: (page - 1) * LIMIT });
    return { mode: 'search' as const, q, sort, page, limit: LIMIT, books, total };
  }

  // Vitrine par collections (derniers livres + description).
  const [collections, total] = await Promise.all([collectionsWithBooks(6), countPublishedBooks()]);
  return { mode: 'collections' as const, q: '', collections, total };
};
