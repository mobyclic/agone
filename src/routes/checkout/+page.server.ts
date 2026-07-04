import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireUser } from '$lib/server/access';
import { cartDetails, clearCart } from '$lib/server/cart';
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
  return { cart, user: u, stripeEnabled: isStripeEnabled() };
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
    const order = await createOrder({ customerId: user.id, email: billing.email, billing, shipping, lines: cart.lines });
    await query(`UPDATE $id SET billing = $b`, { id: recId('user', user.id), b: billing });
    clearCart(cookies);

    if (isStripeEnabled()) {
      const co = await createPaymentCheckout({
        lineItems: cart.lines.map((l) => ({ name: `${l.title} — ${l.format}`, amount: Math.round(l.unit_price * 100), qty: l.qty })),
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
