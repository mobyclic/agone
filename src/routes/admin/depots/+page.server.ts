import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { listDepositaires, remiseDepotDefaut } from '$lib/server/depots';

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals);
  const [depots, remiseDefaut] = await Promise.all([listDepositaires(), remiseDepotDefaut()]);
  return { depots, remiseDefaut };
};
