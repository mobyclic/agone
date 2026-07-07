import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import { getNewsletterIssue, saveNewsletterIssue, deleteNewsletterIssue, type NlBlock } from '$lib/server/newsletterIssue';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ params }) => {
  if (params.id === 'nouveau') return { isNew: true, issue: null };
  const issue = await getNewsletterIssue(params.id);
  if (!issue) throw error(404, { message: 'Numéro introuvable' });
  return { isNew: false, issue };
};

export const actions: Actions = {
  save: async ({ request, params, locals }) => {
    requireStaff(locals);
    const fd = await request.formData();
    const title = String(fd.get('title') ?? '').trim();
    const status = String(fd.get('status') ?? 'draft');
    if (!title) return fail(400, { error: 'Le titre est requis.' });

    let blocks: NlBlock[] = [];
    try {
      const parsed = JSON.parse(String(fd.get('blocks') ?? '[]'));
      blocks = Array.isArray(parsed) ? parsed.filter((b) => b && typeof b.type === 'string') : [];
    } catch {
      blocks = [];
    }

    const editId = params.id && params.id !== 'nouveau' ? params.id : null;
    const id = await saveNewsletterIssue(editId, { title, status, blocks });
    throw redirect(303, withFlash(`/admin/newsletter/numeros/${id}`, 'Numéro enregistré.', 'success'));
  },

  delete: async ({ params, locals }) => {
    requireStaff(locals);
    if (params.id && params.id !== 'nouveau') await deleteNewsletterIssue(params.id);
    throw redirect(303, withFlash('/admin/newsletter', 'Numéro supprimé.', 'success'));
  }
};
