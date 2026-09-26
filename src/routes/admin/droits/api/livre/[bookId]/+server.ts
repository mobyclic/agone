import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/access';
import { contractsForBook, ventesParExerciceLivre, mouvementsLivreTous } from '$lib/server/droits';

/** Aperçu d'un livre pour la liste des contrats : contrats, ventes, mouvements. */
export const GET: RequestHandler = async ({ params, locals }) => {
  requireAdmin(locals);
  const [contrats, ventes, mouvements] = await Promise.all([
    contractsForBook(params.bookId),
    ventesParExerciceLivre(params.bookId),
    mouvementsLivreTous(params.bookId)
  ]);
  return json({ contrats, ventes, mouvements });
};
