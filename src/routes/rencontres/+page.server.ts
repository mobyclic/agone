import type { PageServerLoad } from './$types';
import { listUpcoming } from '$lib/server/events';

export const load: PageServerLoad = async () => {
  return { upcoming: await listUpcoming() };
};
