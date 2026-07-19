import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import { listPromosAdmin } from '$lib/server/promo';

export const load: PageServerLoad = async ({ locals }) => {
  requireStaff(locals);
  return { promos: await listPromosAdmin() };
};
