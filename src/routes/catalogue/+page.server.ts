import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { catalogueComplet, allCollections } from '$lib/server/catalogue';

export const load: PageServerLoad = async ({ url }) => {
  // Anciens liens de recherche (/catalogue?q=…) : la recherche vit sur /recherche.
  const q = url.searchParams.get('q');
  if (q) throw redirect(301, `/recherche?q=${encodeURIComponent(q)}`);

  const [books, collections] = await Promise.all([catalogueComplet(), allCollections()]);
  return {
    books,
    // Ordre éditorial des collections (champ `sort`), pour la facette.
    collectionOrder: collections.map((c: any) => c.slug as string)
  };
};
