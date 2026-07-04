import type { PageServerLoad } from './$types';
import { recentBooks, featuredBooks, listCollections } from '$lib/server/catalogue';

export const load: PageServerLoad = async () => {
  const [recent, featured, collections] = await Promise.all([
    recentBooks(12),
    featuredBooks(6),
    listCollections()
  ]);
  return { recent, featured, collections };
};
