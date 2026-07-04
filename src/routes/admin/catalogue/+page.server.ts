import type { PageServerLoad } from './$types';
import { listBooksAdmin } from '$lib/server/catalogue';

const LIMIT = 50;

export const load: PageServerLoad = async ({ url }) => {
  const q = url.searchParams.get('q') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const { books, total } = await listBooksAdmin({ q, status, limit: LIMIT, offset: (page - 1) * LIMIT });
  return { books, total, q, status, page, limit: LIMIT };
};
