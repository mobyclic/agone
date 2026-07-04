import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getPageBySlug } from '$lib/server/pages';

export const load: PageServerLoad = async ({ params }) => {
  const page = await getPageBySlug(params.slug);
  if (!page) throw error(404, { message: 'Page introuvable' });
  return { page };
};
