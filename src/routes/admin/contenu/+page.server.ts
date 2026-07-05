import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import { listArticlesAdmin, listAllRubriques, saveRubrique, deleteRubrique } from '$lib/server/articles';
import { withFlash } from '$lib/toasts';

const LIMIT = 50;

export const load: PageServerLoad = async ({ url }) => {
  const q = url.searchParams.get('q') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;
  const rubrique = url.searchParams.get('rubrique') ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const [{ articles, total }, rubriques] = await Promise.all([
    listArticlesAdmin({ q, status, rubrique, limit: LIMIT, offset: (page - 1) * LIMIT }),
    listAllRubriques()
  ]);
  return { articles, total, rubriques, q, status, rubrique, page, limit: LIMIT };
};

export const actions: Actions = {
  saveRubrique: async ({ request, locals }) => {
    requireStaff(locals);
    const fd = await request.formData();
    const name = String(fd.get('name') ?? '').trim();
    if (!name) return fail(400, { rubError: 'Le nom de la rubrique est requis.' });
    const id = String(fd.get('id') ?? '') || null;
    await saveRubrique(id, {
      name,
      slug: String(fd.get('slug') ?? '').trim() || undefined,
      kind: String(fd.get('kind') ?? 'blog') || 'blog',
      sort: Number(fd.get('sort') ?? 0) || 0
    });
    throw redirect(303, withFlash('/admin/contenu', 'Rubrique enregistrée.', 'success'));
  },

  deleteRubrique: async ({ request, locals }) => {
    requireStaff(locals);
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    if (id) await deleteRubrique(id);
    throw redirect(303, withFlash('/admin/contenu', 'Rubrique supprimée.', 'success'));
  }
};
