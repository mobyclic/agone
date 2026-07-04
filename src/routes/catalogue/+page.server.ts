import type { PageServerLoad } from './$types';
import { listBooks, listCollections } from '$lib/server/catalogue';

const LIMIT = 24;

export const load: PageServerLoad = async ({ url }) => {
  const q = url.searchParams.get('q') ?? undefined;
  const collection = url.searchParams.get('collection') ?? undefined;
  const sort = (url.searchParams.get('sort') as 'recent' | 'title' | 'price_asc') ?? 'recent';
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);

  const [{ books, total }, collections] = await Promise.all([
    listBooks({ q, collection, sort, limit: LIMIT, offset: (page - 1) * LIMIT }),
    listCollections()
  ]);

  return { books, total, collections, q, collection, sort, page, limit: LIMIT };
};
