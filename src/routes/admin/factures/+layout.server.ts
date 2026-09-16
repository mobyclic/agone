import type { LayoutServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';

// Section réservée aux administrateurs (les actions portent leur propre garde :
// un layout load ne s'exécute pas sur les form actions).
export const load: LayoutServerLoad = ({ locals }) => {
  requireAdmin(locals);
  return {};
};
