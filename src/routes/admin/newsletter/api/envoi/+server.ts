import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/access';
import { etatEnvoi } from '$lib/server/newsletterEnvoi';

/** Avancement de l'envoi de LettrInfo en cours (ou du dernier). */
export const GET: RequestHandler = async ({ locals }) => {
  requireStaff(locals);
  return json(etatEnvoi());
};
