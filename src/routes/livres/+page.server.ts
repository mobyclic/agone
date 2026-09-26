import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Ancien site : /livres/ était le catalogue. */
export const load: PageServerLoad = async () => {
  throw redirect(301, '/catalogue');
};
