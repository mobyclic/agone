import type { PageServerLoad } from './$types';
import { listAuthors } from '$lib/server/authors';

export const load: PageServerLoad = async ({ url }) => {
  // Liste complète chargée une fois : le filtrage est instantané côté client.
  const q = url.searchParams.get('q') ?? '';
  // Index public : uniquement les personnes créditées « auteur » sur au moins un livre.
  const authors = await listAuthors({ onlyAuthors: true });
  return { authors, q };
};
