import type { PageServerLoad } from './$types';
import { requireUser } from '$lib/server/access';
import { listOrdersForUser } from '$lib/server/order';

export const load: PageServerLoad = async ({ locals }) => {
  const user = requireUser(locals);
  return { orders: await listOrdersForUser(user.id) };
};
