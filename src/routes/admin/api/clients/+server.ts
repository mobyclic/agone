import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/access';
import { rechercherClients } from '$lib/server/clients';

/** Recherche de clients (professionnels et particuliers) pour une facture. */
export const GET: RequestHandler = async ({ url, locals }) => {
  requireStaff(locals);
  return json({ results: await rechercherClients(url.searchParams.get('q') ?? '') });
};
