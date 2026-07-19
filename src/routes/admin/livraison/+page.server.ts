import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import { listShipZonesAdmin } from '$lib/server/shipping';

export const load: PageServerLoad = async ({ locals }) => {
  requireStaff(locals);
  return { zones: await listShipZonesAdmin() };
};
