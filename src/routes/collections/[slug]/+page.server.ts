import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getCollectionBySlug } from '$lib/server/catalogue';

export const load: PageServerLoad = async ({ params }) => {
  const result = await getCollectionBySlug(params.slug);
  if (!result) throw error(404, { message: 'Collection introuvable' });
  return result;
};
