import type { PageServerLoad } from './$types';
import { recentBooks, forthcomingBooks, featuredBooks, listCollections } from '$lib/server/catalogue';
import { recentArticles } from '$lib/server/articles';
import { listUpcoming } from '$lib/server/events';

export const load: PageServerLoad = async () => {
  const [recent, forthcoming, featured, articles, upcoming, collections] = await Promise.all([
    recentBooks(6),
    forthcomingBooks(),
    featuredBooks(6),
    recentArticles(4),
    listUpcoming(),
    listCollections()
  ]);
  return {
    recent,
    forthcoming: forthcoming.slice(0, 6),
    featured,
    articles,
    events: upcoming.slice(0, 4),
    collections
  };
};
