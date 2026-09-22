import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getArticleBySlug, articleLadder } from '$lib/server/articles';
import { bookCardsBySlugs } from '$lib/server/catalogue';
import { isStaff } from '$lib/roles';

export const load: PageServerLoad = async ({ params, locals }) => {
  // Brouillons et articles programmés : aperçu pour le staff, 404 pour le public.
  const article = await getArticleBySlug(params.slug, !!locals.user && isStaff(locals.user.role));
  if (!article) throw error(404, { message: 'Article introuvable' });
  const [books, ladder] = await Promise.all([
    bookCardsBySlugs(article.books.map((b) => b.slug)),
    articleLadder(article, 2)
  ]);
  return { article, books, ladder };
};
