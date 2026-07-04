import type { PageServerLoad } from './$types';
import { listAuthors, authorInitials } from '$lib/server/authors';

export const load: PageServerLoad = async ({ url }) => {
  const q = url.searchParams.get('q') ?? undefined;
  const letter = url.searchParams.get('letter') ?? undefined;
  const [authors, initials] = await Promise.all([listAuthors({ q, letter }), authorInitials()]);
  return { authors, initials, q, letter };
};
