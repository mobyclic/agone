import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import { getRubriqueForEdit, saveRubrique, deleteRubrique } from '$lib/server/articles';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ params, locals }) => {
  requireStaff(locals);
  if (params.id === 'nouvelle') return { isNew: true, rubrique: null };
  const rubrique = await getRubriqueForEdit(params.id);
  if (!rubrique) throw error(404, { message: 'Catégorie introuvable' });
  return { isNew: false, rubrique };
};

export const actions: Actions = {
  save: async ({ request, params, locals }) => {
    requireStaff(locals);
    const fd = await request.formData();
    const S = (k: string) => String(fd.get(k) ?? '').trim();
    if (!S('name')) return fail(400, { error: 'Le nom est requis.' });
    const editId = params.id && params.id !== 'nouvelle' ? params.id : null;
    const id = await saveRubrique(editId, { name: S('name'), slug: S('slug') || undefined, kind: 'both' });
    throw redirect(303, withFlash(`/admin/categories/${id}`, 'Catégorie enregistrée.', 'success'));
  },

  delete: async ({ params, locals }) => {
    requireStaff(locals);
    const id = params.id;
    if (id && id !== 'nouvelle') await deleteRubrique(id);
    throw redirect(303, withFlash('/admin/categories', 'Catégorie supprimée.', 'success'));
  }
};
