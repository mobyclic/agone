import { error, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { getStatement, setStatementStatus } from '$lib/server/droits';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ params }) => {
  const statement = await getStatement(params.id);
  if (!statement) throw error(404, { message: 'Reddition introuvable' });
  return { statement };
};

export const actions: Actions = {
  status: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const id = params.id;
    if (!id) throw error(400, { message: 'Reddition manquante' });
    const fd = await request.formData();
    const status = String(fd.get('status') || '') as 'draft' | 'issued' | 'paid';
    if (['draft', 'issued', 'paid'].includes(status)) await setStatementStatus(id, status);
    throw redirect(303, withFlash(`/admin/droits/reddition/${id}`, 'Statut mis à jour.', 'success'));
  }
};
