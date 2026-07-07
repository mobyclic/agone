import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/access';
import { getOrderByNumber } from '$lib/server/order';
import { renderDeliveryNotePdf } from '$lib/server/delivery';

export const GET: RequestHandler = async ({ params, locals, url }) => {
  requireStaff(locals);
  const order = await getOrderByNumber(Number(params.number));
  if (!order) throw error(404, { message: 'Commande introuvable' });
  const bytes = await renderDeliveryNotePdf(String(order.id).replace(/^order:/, ''));
  const disposition = url.searchParams.get('dl') ? 'attachment' : 'inline';
  return new Response(bytes as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="BL-${order.number}.pdf"`,
      'Cache-Control': 'private, no-store'
    }
  });
};
