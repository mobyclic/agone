import type { PageServerLoad } from './$types';
import { recentBooks, forthcomingBooks, featuredBooks } from '$lib/server/catalogue';
import { recentArticles, latestArticle } from '$lib/server/articles';
import { listUpcomingWithVenues } from '$lib/server/events';

export const load: PageServerLoad = async () => {
  const [recent, forthcoming, featured, feature, articles, upcoming] = await Promise.all([
    recentBooks(6),
    forthcomingBooks(),
    featuredBooks(6),
    latestArticle(),
    recentArticles(6),
    listUpcomingWithVenues()
  ]);
  return {
    recent,
    forthcoming: forthcoming.slice(0, 6),
    featured,
    feature,
    articles,
    // Agenda complet : la section Rencontres de l'accueil les porte toutes, la
    // liste défile et la carte suit (cf. EventsExplorer).
    events: upcoming
  };
};
