import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getArticleBySlug } from '$lib/server/articles';

export const load: PageServerLoad = async ({ params }) => {
  const article = await getArticleBySlug(params.slug);
  if (!article) throw error(404, { message: 'Article introuvable' });
  return { article };
};
