import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/access';
import { etatSynchro } from '$lib/server/sync-job';

/** Avancement de la synchronisation WordPress en cours (ou de la dernière). */
export const GET: RequestHandler = async ({ locals }) => {
  requireAdmin(locals);
  return json(etatSynchro());
};
