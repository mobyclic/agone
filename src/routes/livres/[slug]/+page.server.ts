import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { cibleAncienneCollection } from '$lib/server/redirections';

/** Ancien site : /livres/<collection>/ listait une collection. */
export const load: PageServerLoad = async ({ params }) => {
  throw redirect(301, await cibleAncienneCollection(params.slug));
};
