import type { PageServerLoad } from './$types';
import { recentBooks, forthcomingBooks, featuredBooks, listCollections } from '$lib/server/catalogue';
import { recentArticles, latestArticle } from '$lib/server/articles';
import { listUpcoming } from '$lib/server/events';

export const load: PageServerLoad = async () => {
  const [recent, forthcoming, featured, feature, articles, upcoming, collections] = await Promise.all([
    recentBooks(6),
    forthcomingBooks(),
    featuredBooks(6),
    latestArticle(),
    recentArticles(4),
    listUpcoming(),
    listCollections()
  ]);
  return {
    recent,
    forthcoming: forthcoming.slice(0, 6),
    featured,
    feature,
    articles,
    events: upcoming.slice(0, 4),
    collections
  };
};
