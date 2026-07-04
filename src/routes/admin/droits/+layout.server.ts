import type { LayoutServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';

// Module sensible → réservé aux administrateurs.
export const load: LayoutServerLoad = ({ locals }) => {
  requireAdmin(locals);
  return {};
};
