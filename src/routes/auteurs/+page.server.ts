import type { PageServerLoad } from './$types';
import { listAuthors, authorInitials } from '$lib/server/authors';

export const load: PageServerLoad = async ({ url }) => {
  const q = url.searchParams.get('q') ?? undefined;
  const [authors, initials] = await Promise.all([listAuthors({ q }), authorInitials()]);
  return { authors, initials, q };
};
