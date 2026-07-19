import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireUser } from '$lib/server/access';
import { cartDetails, clearCart, getPromoCode, clearPromoCode } from '$lib/server/cart';
import { validatePromo } from '$lib/server/promo';
import { activeShipZones } from '$lib/server/shipping';
import { quoteShippingFor } from '$lib/shipping-calc';
import { COUNTRIES } from '$lib/countries';
import { createOrder } from '$lib/server/order';
import { isStripeEnabled, createPaymentCheckout } from '$lib/server/stripe';
import { query, recId } from '$lib/server/surreal';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ locals, cookies }) => {
  const user = requireUser(locals, '/checkout');
  const cart = await cartDetails(cookies);
  if (cart.lines.length === 0) throw redirect(303, '/panier');
  const u = (await query<any>(
    `SELECT first_name, last_name, email, phone, billing FROM user WHERE id = $id LIMIT 1`,
    { id: recId('user', user.id) }
  ))[0];
  const code = getPromoCode(cookies);
  const promo = code ? await validatePromo(code, cart, user.id) : null;
  const shipZones = await activeShipZones();
  const shipCountries = shipZones.some((z) => z.rest_of_world)
    ? COUNTRIES
    : COUNTRIES.filter((c) => shipZones.some((z) => z.countries.includes(c.code)));
  return { cart, user: u, stripeEnabled: isStripeEnabled(), promo, shipZones, shipCountries };
};

export const actions: Actions = {
  default: async ({ request, locals, cookies, url }) => {
    const user = requireUser(locals);
    const cart = await cartDetails(cookies);
    if (cart.lines.length === 0) throw redirect(303, '/panier');

    const fd = await request.formData();
    const g = (k: string) => String(fd.get(k) || '').trim();
    const billing = {
      first_name: g('first_name'), last_name: g('last_name'),
      address_1: g('address_1'), address_2: g('address_2'),
      postcode: g('postcode'), city: g('city'), country: g('country') || 'FR',
      email: g('email') || user.email, phone: g('phone')
    };
    if (!billing.first_name || !billing.last_name || !billing.email)
      return fail(400, { error: 'Nom et email sont requis.', values: billing });
    if (cart.has_physical && (!billing.address_1 || !billing.postcode || !billing.city))
      return fail(400, { error: 'Une adresse de livraison est requise pour les articles physiques.', values: billing });

    const shipping = cart.has_physical ? billing : undefined;
    // Code promo : re-validé au moment de la commande (le panier a pu changer).
    const code = getPromoCode(cookies);
    const promoRes = code ? await validatePromo(code, cart, user.id) : null;
    const discount = promoRes && promoRes.ok ? promoRes.discount : 0;
    const promoCode = promoRes && promoRes.ok ? promoRes.code : undefined;

    // Frais de port (autoritatif) selon pays + poids.
    const shipQuote = quoteShippingFor(await activeShipZones(), billing.country, cart.total_weight, cart.subtotal);
    if (cart.has_physical && !shipQuote.ok)
      return fail(400, { error: shipQuote.error ?? 'Nous ne livrons pas encore ce pays.', values: billing });
    const shippingTotal = shipQuote.ok ? shipQuote.price : 0;

    const order = await createOrder({ customerId: user.id, email: billing.email, billing, shipping, lines: cart.lines, discount, promoCode, shippingTotal });
    await query(`UPDATE $id SET billing = $b`, { id: recId('user', user.id), b: billing });
    clearCart(cookies);
    clearPromoCode(cookies);

    if (isStripeEnabled()) {
      // Répartit la remise proportionnellement sur les lignes (Stripe n'accepte pas de ligne négative).
      const scale = discount > 0 && cart.subtotal > 0 ? (cart.subtotal - discount) / cart.subtotal : 1;
      const co = await createPaymentCheckout({
        lineItems: [
          ...cart.lines.map((l) => ({ name: `${l.title} — ${l.format}`, amount: Math.round(l.unit_price * scale * 100), qty: l.qty })),
          ...(shippingTotal > 0 ? [{ name: 'Frais de port', amount: Math.round(shippingTotal * 100), qty: 1 }] : [])
        ],
        customerEmail: billing.email,
        clientReferenceId: order.id,
        successUrl: `${url.origin}/commande/${order.number}?paid=1`,
        cancelUrl: `${url.origin}/commande/${order.number}`
      });
      if (co) {
        await query(`UPDATE $id SET stripe_session = $s`, { id: recId('order', order.id), s: co.id });
        if (co.url) throw redirect(303, co.url);
      }
    }
    throw redirect(303, withFlash(`/commande/${order.number}`, 'Commande enregistrée.', 'success'));
  }
};
