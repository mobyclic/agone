/**
 * Stripe — abonnements & transactions.
 * Non configuré (clé absente) → getStripe() renvoie null : l'UI de tarifs reste
 * consultable, seul le passage en caisse est désactivé.
 */
import Stripe from 'stripe';
import { env } from '$env/dynamic/private';

let _stripe: Stripe | null = null;
export function getStripe(): Stripe | null {
  if (_stripe) return _stripe;
  const key = env.STRIPE_SECRET_KEY;
  if (!key) return null;
  _stripe = new Stripe(key, { apiVersion: '2025-09-30.clover' as any });
  return _stripe;
}

export function isStripeEnabled(): boolean {
  return !!env.STRIPE_SECRET_KEY;
}

export const STRIPE_WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET || '';

/**
 * Crée une session Checkout pour un abonnement.
 * `priceId` = id d'un prix Stripe (récurrent). Renvoie l'URL de redirection.
 */
export async function createCheckoutSession(opts: {
  priceId: string;
  customerEmail?: string;
  clientReferenceId?: string; // ex: org id
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: opts.priceId, quantity: 1 }],
    customer_email: opts.customerEmail,
    client_reference_id: opts.clientReferenceId,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: opts.metadata,
    allow_promotion_codes: true
  });
  return session.url;
}

/**
 * Crée une session Checkout en mode PAIEMENT (achat ponctuel de livres).
 * `lineItems.amount` = montant unitaire en CENTIMES. Renvoie { id, url } ou null si Stripe non configuré.
 */
export async function createPaymentCheckout(opts: {
  lineItems: { name: string; amount: number; qty: number }[];
  customerEmail?: string;
  clientReferenceId?: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}): Promise<{ id: string; url: string | null } | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: opts.lineItems.map((li) => ({
      price_data: { currency: 'eur', unit_amount: Math.round(li.amount), product_data: { name: li.name } },
      quantity: li.qty
    })),
    customer_email: opts.customerEmail,
    client_reference_id: opts.clientReferenceId,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: opts.metadata
  });
  return { id: session.id, url: session.url };
}

/** Portail de gestion d'abonnement (facturation, résiliation). */
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string
): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl
  });
  return session.url;
}
