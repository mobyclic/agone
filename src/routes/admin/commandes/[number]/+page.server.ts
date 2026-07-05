import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import { getOrderByNumber, setOrderStatus, ORDER_STATUSES } from '$lib/server/order';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ params }) => {
  const order = await getOrderByNumber(Number(params.number));
  if (!order) throw error(404, { message: 'Commande introuvable' });
  return { order };
};

export const actions: Actions = {
  status: async ({ request, params, locals }) => {
    requireStaff(locals);
    const fd = await request.formData();
    const status = String(fd.get('status') ?? '');
    if (!(ORDER_STATUSES as readonly string[]).includes(status)) return fail(400, { error: 'Statut invalide.' });
    await setOrderStatus(Number(params.number), status);
    throw redirect(303, withFlash(`/admin/commandes/${params.number}`, 'Statut mis à jour.', 'success'));
  }
};
