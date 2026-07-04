import type { PageServerLoad } from './$types';
import { listAuthorsAdmin } from '$lib/server/authors';

const LIMIT = 60;

export const load: PageServerLoad = async ({ url }) => {
  const q = url.searchParams.get('q') ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const { authors, total } = await listAuthorsAdmin({ q, limit: LIMIT, offset: (page - 1) * LIMIT });
  return { authors, total, q, page, limit: LIMIT };
};
