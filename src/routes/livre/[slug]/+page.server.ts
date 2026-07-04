import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getBookBySlug } from '$lib/server/catalogue';

export const load: PageServerLoad = async ({ params }) => {
  const book = await getBookBySlug(params.slug);
  if (!book) throw error(404, { message: 'Livre introuvable' });
  return { book };
};
