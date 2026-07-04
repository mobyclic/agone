import type { LayoutServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';

export const load: LayoutServerLoad = ({ locals, url }) => {
  const user = requireStaff(locals, url.pathname);
  return { user };
};
