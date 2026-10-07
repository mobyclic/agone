import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/access';
import { getInvoice } from '$lib/server/invoice';
import { getObject } from '$lib/server/storage';

/** Le PDF d'origine d'une facture importée (bucket privé), servi aux administrateurs. */
export const GET: RequestHandler = async ({ params, locals, url }) => {
  requireAdmin(locals);
  const inv = await getInvoice(params.id);
  if (!inv?.document_key) throw error(404, { message: 'Pas de document d’origine' });
  const obj = await getObject(inv.document_key);
  if (!obj) throw error(404, { message: 'Fichier introuvable' });
  const disposition = url.searchParams.get('dl') ? 'attachment' : 'inline';
  return new Response(obj.body as any, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `${disposition}; filename="${inv.ref}.pdf"`, 'Cache-Control': 'private, no-store' }
  });
};
