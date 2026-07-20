import type { PageServerLoad } from './$types';
import { listAuthors } from '$lib/server/authors';

export const load: PageServerLoad = async ({ url }) => {
  // Liste complète chargée une fois : le filtrage est instantané côté client.
  const q = url.searchParams.get('q') ?? '';
  const authors = await listAuthors({});
  return { authors, q };
};
