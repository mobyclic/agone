import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { getUserForEdit, updateUser } from '$lib/server/account';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ params }) => {
  const user = await getUserForEdit(params.id);
  if (!user) throw error(404, { message: 'Client introuvable' });
  return { client: user };
};

export const actions: Actions = {
  save: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const id = params.id;
    if (!id) throw error(404, { message: 'Client introuvable' });
    const fd = await request.formData();
    const S = (k: string) => String(fd.get(k) ?? '').trim();
    try {
      await updateUser(id, {
        first_name: S('first_name'),
        last_name: S('last_name'),
        email: S('email'),
        phone: S('phone'),
        role: S('role'),
        accepts_newsletter: fd.get('accepts_newsletter') === 'on',
        notes: S('notes')
      });
    } catch (e) {
      return fail(400, { error: 'Impossible d’enregistrer (email déjà utilisé ?).' });
    }
    throw redirect(303, withFlash(`/admin/utilisateurs/${id}`, 'Fiche client enregistrée.', 'success'));
  }
};
