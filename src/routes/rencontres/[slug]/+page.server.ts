import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getEventBySlug } from '$lib/server/events';

export const load: PageServerLoad = async ({ params }) => {
  const event = await getEventBySlug(params.slug);
  if (!event) throw error(404, { message: 'Rencontre introuvable' });
  return { event };
};
