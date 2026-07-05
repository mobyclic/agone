import type { RequestHandler } from './$types';
import { incrementArticleViews } from '$lib/server/articles';

/** Incrément du compteur de vues (appelé une fois à l'affichage côté client). */
export const POST: RequestHandler = async ({ params }) => {
  await incrementArticleViews(params.slug);
  return new Response(null, { status: 204 });
};
