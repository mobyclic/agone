import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import { getArticleForEdit, saveArticle, deleteArticle, listAllRubriques, type ArticleInput } from '$lib/server/articles';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ params }) => {
  const rubriques = await listAllRubriques();
  if (params.id === 'nouveau') return { isNew: true, article: null, rubriques };
  const article = await getArticleForEdit(params.id);
  if (!article) throw error(404, { message: 'Article introuvable' });
  return { isNew: false, article, rubriques };
};

export const actions: Actions = {
  save: async ({ request, params, locals }) => {
    requireStaff(locals);
    const fd = await request.formData();
    const S = (k: string) => (fd.get(k) ? String(fd.get(k)).trim() : '');
    const title = S('title');
    if (!title) return fail(400, { error: 'Le titre est requis.' });

    const input: ArticleInput = {
      title,
      slug: S('slug') || undefined,
      status: S('status') || 'draft',
      excerpt: S('excerpt') || undefined,
      body_html: S('body_html') || undefined,
      is_newsletter_issue: fd.get('is_newsletter_issue') === 'on',
      published_at: S('published_at') || undefined,
      rubriqueId: S('rubrique') || undefined,
      coverId: S('coverId') || undefined
    };

    const editId = params.id && params.id !== 'nouveau' ? params.id : null;
    const id = await saveArticle(editId, input);
    throw redirect(303, withFlash(`/admin/contenu/${id}`, 'Article enregistré.', 'success'));
  },

  delete: async ({ params, locals }) => {
    requireStaff(locals);
    if (params.id && params.id !== 'nouveau') await deleteArticle(params.id);
    throw redirect(303, withFlash('/admin/contenu', 'Article supprimé.', 'success'));
  }
};
