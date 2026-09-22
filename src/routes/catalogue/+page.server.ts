import type { PageServerLoad } from './$types';
import { catalogueComplet, allCollections } from '$lib/server/catalogue';

export const load: PageServerLoad = async () => {
  // Recherche (?q=), facettes et tri sont appliqués côté client, sur tout le catalogue.
  const [books, collections] = await Promise.all([catalogueComplet(), allCollections()]);
  return {
    books,
    // Ordre éditorial des collections (champ `sort`), pour la facette.
    collectionOrder: collections.map((c: any) => c.slug as string)
  };
};
