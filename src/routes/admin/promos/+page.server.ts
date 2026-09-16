import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { listPromosAdmin } from '$lib/server/promo';

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals);
  return { promos: await listPromosAdmin() };
};
