import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAuthorBySlug } from '$lib/server/authors';

export const load: PageServerLoad = async ({ params }) => {
  const author = await getAuthorBySlug(params.slug);
  if (!author) throw error(404, { message: 'Auteur introuvable' });
  return { author };
};
