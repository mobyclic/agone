import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** /auteurs/<slug> n'a jamais existé chez nous, mais les liens à la main y mènent. */
export const load: PageServerLoad = async ({ params }) => {
  throw redirect(301, `/auteur/${params.slug}`);
};
