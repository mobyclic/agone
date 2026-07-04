import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import { getAuthorAdmin, upsertAuthor, deleteAuthor, type AuthorInput } from '$lib/server/authors';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ params }) => {
  if (params.id === 'nouveau') return { isNew: true, author: null };
  const author = await getAuthorAdmin(params.id);
  if (!author) throw error(404, { message: 'Auteur introuvable' });
  return { isNew: false, author };
};

export const actions: Actions = {
  save: async ({ request, params, locals }) => {
    requireStaff(locals);
    const fd = await request.formData();
    const S = (k: string) => (fd.get(k) ? String(fd.get(k)).trim() : '');
    const I = (k: string) => { const v = S(k); return v === '' ? undefined : Number(v); };

    if (!S('first_name') && !S('last_name')) return fail(400, { error: 'Un nom est requis.' });

    const input: AuthorInput = {
      first_name: S('first_name'),
      last_name: S('last_name'),
      bio_html: S('bio_html') || undefined,
      portraitId: S('portraitId') || undefined,
      hidden: fd.get('hidden') === 'on',
      nationality: S('nationality') || undefined,
      birth_year: I('birth_year'),
      death_year: I('death_year'),
      website: S('website') || undefined,
      legal_name: S('legal_name') || undefined,
      siret: S('siret') || undefined
    };
    const editId = params.id && params.id !== 'nouveau' ? params.id : null;
    const id = await upsertAuthor(editId, input);
    throw redirect(303, withFlash(`/admin/auteurs/${id}`, 'Auteur enregistré.', 'success'));
  },

  delete: async ({ params, locals }) => {
    requireStaff(locals);
    if (params.id && params.id !== 'nouveau') await deleteAuthor(params.id);
    throw redirect(303, withFlash('/admin/auteurs', 'Auteur supprimé.', 'success'));
  }
};
