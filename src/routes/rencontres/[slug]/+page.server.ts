import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getEventBySlug } from '$lib/server/events';
import { bookCardsBySlugs } from '$lib/server/catalogue';

export const load: PageServerLoad = async ({ params }) => {
  const event = await getEventBySlug(params.slug);
  if (!event) throw error(404, { message: 'Rencontre introuvable' });
  const books = await bookCardsBySlugs(event.books.map((b) => b.slug));
  return { event, books };
};
