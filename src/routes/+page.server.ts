import type { PageServerLoad } from './$types';
import { recentBooks, listCollections } from '$lib/server/catalogue';
import { recentArticles } from '$lib/server/articles';
import { listUpcoming } from '$lib/server/events';

export const load: PageServerLoad = async () => {
  const [recent, articles, upcoming, collections] = await Promise.all([
    recentBooks(8),
    recentArticles(5),
    listUpcoming(),
    listCollections()
  ]);
  return { recent, articles, events: upcoming.slice(0, 4), collections };
};
