import type { LayoutServerLoad } from './$types';
import { requireUser } from '$lib/server/access';

export const load: LayoutServerLoad = ({ locals, url }) => {
  const user = requireUser(locals, url.pathname);
  return { user };
};
