import type { PageServerLoad } from './$types';
import { listUpcomingWithVenues } from '$lib/server/events';

export const load: PageServerLoad = async () => {
  // Même agenda que l'accueil : liste dépliante + carte (cf. EventsExplorer).
  return { events: await listUpcomingWithVenues() };
};
