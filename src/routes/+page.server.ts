import type { PageServerLoad } from './$types';
import { recentBooks, forthcomingBooks, featuredBooks } from '$lib/server/catalogue';
import { recentArticles, latestArticle } from '$lib/server/articles';
import { listUpcoming } from '$lib/server/events';

export const load: PageServerLoad = async () => {
  const [recent, forthcoming, featured, feature, articles, upcoming] = await Promise.all([
    recentBooks(6),
    forthcomingBooks(),
    featuredBooks(6),
    latestArticle(),
    recentArticles(6),
    listUpcoming()
  ]);
  return {
    recent,
    forthcoming: forthcoming.slice(0, 6),
    featured,
    feature,
    articles,
    events: upcoming.slice(0, 6),
    // Pastilles carte : toutes les rencontres à venir géolocalisées.
    eventPins: upcoming
      .filter((e) => e.venue_lat != null && e.venue_lng != null)
      .map((e) => ({ slug: e.slug, title: e.title, lat: e.venue_lat!, lng: e.venue_lng!, city: e.venue_city, start: e.start_at, end: e.end_at }))
  };
};
