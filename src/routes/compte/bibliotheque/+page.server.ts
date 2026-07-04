import type { PageServerLoad } from './$types';
import { requireUser } from '$lib/server/access';
import { getUserLibrary } from '$lib/server/library';

export const load: PageServerLoad = async ({ locals }) => {
  const user = requireUser(locals);
  return { books: await getUserLibrary(user.id) };
};
