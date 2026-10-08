import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/access';
import { getClientPro } from '$lib/server/clients';
import { gabaritCarnet } from '$lib/server/depots';

/** Carnet de vente vierge du dépôt, pré-rempli avec son stock (xlsx avec formules). */
export const GET: RequestHandler = async ({ params, locals }) => {
  requireAdmin(locals);
  const client = await getClientPro(params.id);
  if (!client?.depositaire) throw error(404, { message: 'Dépôt introuvable' });
  const buf = await gabaritCarnet(client);
  const nom = `carnet-${client.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${nom}"` }
  });
};
