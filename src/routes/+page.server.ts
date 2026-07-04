import type { PageServerLoad } from './$types';
import { recentBooks, featuredBooks, listCollections } from '$lib/server/catalogue';
import { recentArticles } from '$lib/server/articles';

export const load: PageServerLoad = async () => {
  const [recent, featured, collections, articles] = await Promise.all([
    recentBooks(18),
    featuredBooks(6),
    listCollections(),
    recentArticles(4)
  ]);
  return { recent, featured, collections, articles };
};
