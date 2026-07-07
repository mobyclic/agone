import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/access';
import { getInvoice, renderInvoicePdf } from '$lib/server/invoice';

export const GET: RequestHandler = async ({ params, locals, url }) => {
  requireStaff(locals);
  const inv = await getInvoice(params.id);
  if (!inv) throw error(404, { message: 'Facture introuvable' });
  const bytes = await renderInvoicePdf(params.id);
  const disposition = url.searchParams.get('dl') ? 'attachment' : 'inline';
  const prefix = inv.kind === 'credit_note' ? 'Avoir' : 'Facture';
  return new Response(bytes as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${prefix}-${inv.ref}.pdf"`,
      'Cache-Control': 'private, no-store'
    }
  });
};
