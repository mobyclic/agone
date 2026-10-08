import type { PageServerLoad } from './$types';
import { listBooksAdmin, anneesParution, collectionsPourFiltre } from '$lib/server/catalogue';

const LIMIT = 50;

export const load: PageServerLoad = async ({ url }) => {
  const q = url.searchParams.get('q') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;
  const collection = url.searchParams.get('collection') ?? undefined;
  const ebook = url.searchParams.get('ebook') ?? undefined;
  const year = Number(url.searchParams.get('year')) || undefined;
  const sort = url.searchParams.get('sort') ?? 'recent';
  const dir = url.searchParams.get('dir') ?? 'desc';
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const [{ books, total }, collections, years] = await Promise.all([
    listBooksAdmin({ q, status, collection, ebook, year, sort, dir, limit: LIMIT, offset: (page - 1) * LIMIT }),
    collectionsPourFiltre(),
    anneesParution()
  ]);
  return { books, total, q, status, collection, ebook, year, sort, dir, page, limit: LIMIT, collections, years };
};
