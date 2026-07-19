import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import { getCollectionForEdit, saveCollection, deleteCollection, booksInCollectionAdmin } from '$lib/server/catalogue';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ params }) => {
  if (params.id === 'nouvelle') return { isNew: true, collection: null, books: [] };
  const [collection, books] = await Promise.all([
    getCollectionForEdit(params.id),
    booksInCollectionAdmin(params.id)
  ]);
  if (!collection) throw error(404, { message: 'Collection introuvable' });
  return { isNew: false, collection, books };
};

export const actions: Actions = {
  save: async ({ request, params, locals }) => {
    requireStaff(locals);
    const fd = await request.formData();
    const S = (k: string) => String(fd.get(k) ?? '').trim();
    if (!S('name')) return fail(400, { error: 'Le nom est requis.' });
    const editId = params.id && params.id !== 'nouvelle' ? params.id : null;
    const id = await saveCollection(editId, {
      name: S('name'),
      slug: S('slug') || undefined,
      description: S('description') || undefined
    });
    throw redirect(303, withFlash(`/admin/collections/${id}`, 'Collection enregistrée.', 'success'));
  },

  delete: async ({ params, locals }) => {
    requireStaff(locals);
    const id = params.id;
    if (!id || id === 'nouvelle') throw redirect(303, '/admin/collections');
    try {
      await deleteCollection(id);
    } catch (e) {
      if (e instanceof Error && e.message === 'COLLECTION_HAS_BOOKS') {
        throw redirect(303, withFlash(`/admin/collections/${id}`, 'Suppression impossible : des livres sont rattachés à cette collection.', 'error'));
      }
      throw e;
    }
    throw redirect(303, withFlash('/admin/collections', 'Collection supprimée.', 'success'));
  }
};
