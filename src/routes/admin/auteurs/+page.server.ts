import type { PageServerLoad } from './$types';
import { listAuthorsOverview } from '$lib/server/authors';

export const load: PageServerLoad = async () => {
  // Liste complète : recherche, filtres, tri, pagination et export se font côté client.
  return { authors: await listAuthorsOverview() };
};
