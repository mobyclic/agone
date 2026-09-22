import { fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import { listArticlesAdmin, listAllRubriques, setArticleStatus, type ArticleSort } from '$lib/server/articles';

const LIMIT = 50;
const SORTS: ArticleSort[] = ['title', 'status', 'views', 'date'];

export const load: PageServerLoad = async ({ url }) => {
  const q = url.searchParams.get('q') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;
  const rubrique = url.searchParams.get('rubrique') ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const sortParam = url.searchParams.get('sort') ?? 'date';
  const sort: ArticleSort = SORTS.includes(sortParam as ArticleSort) ? (sortParam as ArticleSort) : 'date';
  const dir: 'asc' | 'desc' = url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc';
  const [{ articles, total }, rubriques] = await Promise.all([
    listArticlesAdmin({ q, status, rubrique, sort, dir, limit: LIMIT, offset: (page - 1) * LIMIT }),
    listAllRubriques()
  ]);
  return { articles, total, rubriques, q, status, rubrique, sort, dir, page, limit: LIMIT };
};

export const actions: Actions = {
  // Interrupteur Publié / Brouillon de la liste.
  statut: async ({ request, locals }) => {
    requireStaff(locals);
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    const s = String(fd.get('status') ?? '');
    if (!id || (s !== 'published' && s !== 'draft')) return fail(400, { error: 'Requête invalide.' });
    await setArticleStatus(id, s);
    return { ok: true };
  }
};
