import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/access';
import { exportInvoices } from '$lib/server/invoice';
import { csvFactures, filtreDepuisUrl, nomExport } from '$lib/server/factureExport';

/** Export CSV des factures : la sélection cochée (ids) ou le filtre courant. */
export const GET: RequestHandler = async ({ url, locals }) => {
  requireAdmin(locals);
  const filtre = filtreDepuisUrl(url.searchParams);
  const csv = csvFactures(await exportInvoices(filtre));
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nomExport(filtre, 'csv')}"`, 'Cache-Control': 'private, no-store' } });
};
