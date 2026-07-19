import type { PageServerLoad } from './$types';
import { listAuthorsAdmin, type AuthorSort } from '$lib/server/authors';

const LIMIT = 60;
const SORTS: AuthorSort[] = ['name', 'titres', 'visibilite'];

export const load: PageServerLoad = async ({ url }) => {
  const q = url.searchParams.get('q') ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const sortParam = url.searchParams.get('sort') ?? 'name';
  const sort: AuthorSort = SORTS.includes(sortParam as AuthorSort) ? (sortParam as AuthorSort) : 'name';
  const dir: 'asc' | 'desc' = url.searchParams.get('dir') === 'desc' ? 'desc' : 'asc';
  const { authors, total } = await listAuthorsAdmin({ q, limit: LIMIT, offset: (page - 1) * LIMIT, sort, dir });
  return { authors, total, q, page, limit: LIMIT, sort, dir };
};
