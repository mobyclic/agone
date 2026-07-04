import type { PageServerLoad } from './$types';
import { listArticles, listBlogRubriques } from '$lib/server/articles';

const LIMIT = 18;

export const load: PageServerLoad = async ({ url }) => {
  const rubrique = url.searchParams.get('rubrique') ?? undefined;
  const q = url.searchParams.get('q') ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const [{ articles, total }, rubriques] = await Promise.all([
    listArticles({ rubrique, q, limit: LIMIT, offset: (page - 1) * LIMIT }),
    listBlogRubriques()
  ]);
  return { articles, total, rubriques, rubrique, q, page, limit: LIMIT };
};
