import type { PageServerLoad } from './$types';
import { contractCoverage } from '$lib/server/droits';

export const load: PageServerLoad = async ({ url }) => {
  const q = url.searchParams.get('q') ?? undefined;
  const books = await contractCoverage({ q, limit: 150 });
  return { books, q };
};
