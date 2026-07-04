import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireUser } from '$lib/server/access';
import { getOrderByNumber } from '$lib/server/order';
import { isStaff } from '$lib/roles';

export const load: PageServerLoad = async ({ params, locals }) => {
  const user = requireUser(locals, `/commande/${params.number}`);
  const order = await getOrderByNumber(Number(params.number));
  if (!order) throw error(404, { message: 'Commande introuvable' });
  const owner = order.customer && String(order.customer) === user.id;
  if (!owner && !isStaff(user.role)) throw error(403, { code: 'FORBIDDEN', message: 'Cette commande ne vous appartient pas.' });
  return { order };
};
