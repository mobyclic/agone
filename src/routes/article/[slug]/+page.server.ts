import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getArticleBySlug, articleLadder } from '$lib/server/articles';
import { bookCardsBySlugs } from '$lib/server/catalogue';

export const load: PageServerLoad = async ({ params }) => {
  const article = await getArticleBySlug(params.slug);
  if (!article) throw error(404, { message: 'Article introuvable' });
  const [books, ladder] = await Promise.all([
    bookCardsBySlugs(article.books.map((b) => b.slug)),
    articleLadder(article, 2)
  ]);
  return { article, books, ladder };
};
