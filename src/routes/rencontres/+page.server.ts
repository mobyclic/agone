import type { PageServerLoad } from './$types';
import { listUpcoming, listPast } from '$lib/server/events';

export const load: PageServerLoad = async () => {
  const [upcoming, past] = await Promise.all([listUpcoming(), listPast(48)]);
  return { upcoming, past };
};
