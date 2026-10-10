import { json, text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStripe, STRIPE_WEBHOOK_SECRET, isStripeEnabled } from '$lib/server/stripe';
import { markOrderPaid } from '$lib/server/order';
import { ajouterAdhesion, majAbonnementClub, memoriserClientStripe } from '$lib/server/club';
import { query, recId } from '$lib/server/surreal';

/**
 * Webhook Stripe. Événements à activer sur l'endpoint (tableau de bord Stripe) :
 *   checkout.session.completed · invoice.paid · customer.subscription.updated · customer.subscription.deleted
 *
 * - Commande du site : session payée → commande payée (facture, ebooks, e-mail, export BLDD).
 * - Club : chaque facture d'abonnement payée (première période comme renouvellement)
 *   ajoute une période d'adhésion et sa facture ; une résiliation coupe le
 *   renouvellement automatique (l'adhésion en cours reste valable jusqu'à sa fin).
 * Tout est idempotent : Stripe peut rejouer un événement.
 */
export const POST: RequestHandler = async ({ request }) => {
  if (!isStripeEnabled()) return text('stripe disabled', { status: 200 });
  const stripe = getStripe();
  if (!stripe) return text('no stripe', { status: 200 });
  // Sans secret, un événement ne peut pas être authentifié : on refuse plutôt que de croire
  // n'importe quel corps de requête (qui marquerait des commandes payées).
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe webhook] STRIPE_WEBHOOK_SECRET absent : événement refusé.');
    return text('webhook secret not configured', { status: 503 });
  }

  const sig = request.headers.get('stripe-signature') ?? '';
  const body = await request.text();
  let event;
  try {
    // Version asynchrone : fonctionne sous Node comme sous Bun (SubtleCrypto).
    event = await stripe.webhooks.constructEventAsync(body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (e: any) {
    return text(`bad signature: ${e?.message ?? e}`, { status: 400 });
  }

  const obj: any = event.data.object;

  // ── Club ──────────────────────────────────────────────────────
  if (event.type === 'checkout.session.completed' && obj?.metadata?.type === 'club') {
    if (obj.customer && obj.metadata.user) { try { await memoriserClientStripe(String(obj.metadata.user), String(obj.customer)); } catch { /* non bloquant */ } }
    // Ancienne adhésion par paiement unique ; en abonnement, la période arrive avec invoice.paid.
    if (obj.mode === 'payment') {
      try { await ajouterAdhesion(String(obj.metadata.user), { source: 'stripe', montant: Number(obj.amount_total ?? 0) / 100, methode: 'stripe', stripeSession: String(obj.id) }); }
      catch (e) { console.error('[stripe webhook] adhésion club', e); }
    }
    return json({ received: true });
  }
  if (event.type === 'invoice.paid') {
    const details = obj?.parent?.subscription_details;
    const meta = details?.metadata ?? {};
    if (meta.type === 'club' && meta.user) {
      const montant = Number(obj.amount_paid ?? 0) / 100;
      const periode = obj.lines?.data?.[0]?.period;
      const subscription = typeof details.subscription === 'string' ? details.subscription : details.subscription?.id;
      // Facture à 0 € : période d'essai jusqu'à la fin d'une adhésion déjà en cours — rien à ajouter.
      if (montant > 0 && periode?.start && periode?.end) {
        try {
          await ajouterAdhesion(String(meta.user), {
            source: 'stripe', montant, methode: 'stripe', stripeSession: String(obj.id), stripeSubscription: subscription,
            debut: new Date(periode.start * 1000), fin: new Date(periode.end * 1000),
            note: obj.billing_reason === 'subscription_cycle' ? 'Renouvellement automatique' : 'Abonnement'
          });
        } catch (e) { console.error('[stripe webhook] période club', e); }
      }
      if (obj.customer) { try { await memoriserClientStripe(String(meta.user), String(obj.customer)); } catch { /* non bloquant */ } }
    }
    return json({ received: true });
  }
  if ((event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') && obj?.metadata?.type === 'club') {
    const renouvellement = event.type === 'customer.subscription.updated' && ['active', 'trialing'].includes(obj.status) && !obj.cancel_at_period_end && !obj.cancel_at;
    try { await majAbonnementClub(String(obj.id), renouvellement); } catch (e) { console.error('[stripe webhook] abonnement club', e); }
    return json({ received: true });
  }

  // ── Commandes du site ─────────────────────────────────────────
  if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
    const orderId = obj.client_reference_id || obj.metadata?.order_id;
    if (orderId) {
      // L'identifiant du paiement sert au remboursement depuis la fiche commande.
      const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.object === 'payment_intent' ? obj.id : undefined;
      if (pi) {
        try { await query(`UPDATE $id SET stripe_payment_intent = $pi`, { id: recId('order', String(orderId)), pi }); } catch { /* champ non bloquant */ }
      }
      // Session expirée ou paiement différé non abouti : rien à marquer.
      if (event.type === 'checkout.session.completed' && obj.payment_status && obj.payment_status !== 'paid') return json({ received: true });
      try { await markOrderPaid(String(orderId)); } catch (e) { console.error('[stripe webhook] markOrderPaid', e); }
    }
  }
  return json({ received: true });
};
