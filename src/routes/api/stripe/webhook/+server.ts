import { json, text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStripe, STRIPE_WEBHOOK_SECRET, isStripeEnabled } from '$lib/server/stripe';
import { markOrderPaid } from '$lib/server/order';
import { ajouterAdhesion } from '$lib/server/club';
import { query, recId } from '$lib/server/surreal';

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

  // Adhésion au club payée : une période d'adhésion + sa facture réglée (idempotent par session).
  if (event.type === 'checkout.session.completed' && (event.data.object as any)?.metadata?.type === 'club') {
    const s: any = event.data.object;
    try { await ajouterAdhesion(String(s.metadata.user), { source: 'stripe', montant: Number(s.amount_total ?? 0) / 100, methode: 'stripe', stripeSession: String(s.id) }); }
    catch (e) { console.error('[stripe webhook] adhésion club', e); }
    return json({ received: true });
  }

  if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
    const obj: any = event.data.object;
    const orderId = obj.client_reference_id || obj.metadata?.order_id;
    if (orderId) {
      // L'identifiant du paiement sert au remboursement depuis la fiche commande.
      const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.object === 'payment_intent' ? obj.id : undefined;
      if (pi) {
        try { await query(`UPDATE $id SET stripe_payment_intent = $pi`, { id: recId('order', String(orderId)), pi }); } catch { /* champ non bloquant */ }
      }
      try { await markOrderPaid(String(orderId)); } catch (e) { console.error('[stripe webhook] markOrderPaid', e); }
    }
  }
  return json({ received: true });
};
