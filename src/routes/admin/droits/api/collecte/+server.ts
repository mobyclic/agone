import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/access';
import { etatCollecte } from '$lib/server/droits-job';

/** Avancement du relevé d'exercice en cours (ou du dernier). */
export const GET: RequestHandler = async ({ locals }) => {
  requireAdmin(locals);
  return json(etatCollecte());
};
