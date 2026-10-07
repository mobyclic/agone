import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/access';
import { zipFactures, filtreDepuisUrl, nomExport } from '$lib/server/factureExport';

/** Archive ZIP des PDF (sélection cochée ou filtre courant), avec le CSV du lot. */
export const GET: RequestHandler = async ({ url, locals }) => {
  requireAdmin(locals);
  const filtre = filtreDepuisUrl(url.searchParams);
  const { zip } = await zipFactures(filtre);
  return new Response(zip as any, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${nomExport(filtre, 'zip')}"`, 'Cache-Control': 'private, no-store' } });
};
