import { json, text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStripe, STRIPE_WEBHOOK_SECRET, isStripeEnabled } from '$lib/server/stripe';
import { markOrderPaid } from '$lib/server/order';

export const POST: RequestHandler = async ({ request }) => {
  if (!isStripeEnabled()) return text('stripe disabled', { status: 200 });
  const stripe = getStripe();
  if (!stripe) return text('no stripe', { status: 200 });

  const sig = request.headers.get('stripe-signature') ?? '';
  const body = await request.text();
  let event;
  try {
    event = STRIPE_WEBHOOK_SECRET
      ? stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)
      : JSON.parse(body);
  } catch (e: any) {
    return text(`bad signature: ${e?.message ?? e}`, { status: 400 });
  }

  if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
    const obj: any = event.data.object;
    const orderId = obj.client_reference_id || obj.metadata?.order_id;
    if (orderId) {
      try { await markOrderPaid(String(orderId)); } catch (e) { console.error('[stripe webhook] markOrderPaid', e); }
    }
  }
  return json({ received: true });
};
