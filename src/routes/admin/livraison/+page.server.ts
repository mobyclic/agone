import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { listShipZonesAdmin } from '$lib/server/shipping';

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals);
  return { zones: await listShipZonesAdmin() };
};
