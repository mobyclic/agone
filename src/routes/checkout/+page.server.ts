import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireUser } from '$lib/server/access';
import { cartDetails, clearCart, getPromoCode, clearPromoCode } from '$lib/server/cart';
import { remisePanier } from '$lib/server/promo';
import { getClub, adhesionActive, portOffert } from '$lib/server/club';
import { activeShipZones } from '$lib/server/shipping';
import { quoteShippingFor } from '$lib/shipping-calc';
import { COUNTRIES } from '$lib/countries';
import { createOrder } from '$lib/server/order';
import { formatVendable } from '$lib/server/catalogue';
import { isStripeEnabled, createPaymentCheckout } from '$lib/server/stripe';
import { query, recId } from '$lib/server/surreal';
import { withFlash } from '$lib/toasts';

/** Port offert à ce membre du club pour ce panier ? */
async function francoPour(cart: { has_physical: boolean; lines: { id: string }[] }, userId: string): Promise<boolean> {
  if (!cart.has_physical) return false;
  const [club, membre] = await Promise.all([getClub(), adhesionActive(userId)]);
  if (!club.active || !membre || club.franco === 'non') return false;
  const parutions = await query<string>(`SELECT VALUE published_at FROM book WHERE id IN $ids`, { ids: cart.lines.map((l) => recId('book', String(l.id).replace(/^book:/, ''))) });
  return portOffert(club, true, parutions);
}

export const load: PageServerLoad = async ({ locals, cookies }) => {
  const user = requireUser(locals, '/checkout');
  const cart = await cartDetails(cookies);
  if (cart.lines.length === 0) throw redirect(303, '/panier');
  const u = (await query<any>(
    `SELECT first_name, last_name, email, phone, billing, shipping FROM user WHERE id = $id LIMIT 1`,
    { id: recId('user', user.id) }
  ))[0];
  const code = getPromoCode(cookies);
  const { promo } = await remisePanier(cart, user.id, code);
  const francoClub = await francoPour(cart, user.id);
  const shipZones = await activeShipZones();
  const shipCountries = shipZones.some((z) => z.rest_of_world)
    ? COUNTRIES
    : COUNTRIES.filter((c) => shipZones.some((z) => z.countries.includes(c.code)));
  return { cart, user: u, stripeEnabled: isStripeEnabled(), promo, francoClub, shipZones, shipCountries, countries: COUNTRIES };
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
    // Livraison à une autre adresse (cadeau, bureau…) : champs préfixés `ship_`.
    const separee = cart.has_physical && fd.get('ship_different') === 'on';
    const autre = {
      first_name: g('ship_first_name'), last_name: g('ship_last_name'),
      address_1: g('ship_address_1'), address_2: g('ship_address_2'),
      postcode: g('ship_postcode'), city: g('ship_city'), country: g('ship_country') || 'FR',
      phone: g('ship_phone')
    };
    const values = { ...billing, ship_different: separee, ship: autre };

    // Le panier a pu vieillir : un titre épuisé entre-temps ne doit pas être vendu.
    for (const l of cart.lines) {
      const v = await formatVendable(l.id, l.format);
      if (!v.ok) return fail(400, { error: `${v.raison} Retirez-le du panier pour continuer.`, values });
    }
    if (!billing.first_name || !billing.last_name || !billing.email)
      return fail(400, { error: 'Nom et email sont requis.', values });
    if (cart.has_physical && (!billing.address_1 || !billing.postcode || !billing.city))
      return fail(400, { error: 'L’adresse de facturation est requise.', values });
    if (separee && (!autre.first_name || !autre.last_name || !autre.address_1 || !autre.postcode || !autre.city))
      return fail(400, { error: 'L’adresse de livraison est incomplète.', values });

    const shipping = cart.has_physical
      ? separee ? { ...autre, email: billing.email } : billing
      : undefined;
    // Code promo : re-validé au moment de la commande (le panier a pu changer).
    const code = getPromoCode(cookies);
    const { promo: promoRes } = await remisePanier(cart, user.id, code);
    const discount = promoRes && promoRes.ok ? promoRes.discount : 0;
    const promoCode = promoRes && promoRes.ok ? promoRes.code : undefined;
    const lineDiscounts = promoRes && promoRes.ok ? promoRes.lignes : [];

    // Frais de port (autoritatif) selon pays + poids.
    const shipQuote = quoteShippingFor(await activeShipZones(), shipping?.country ?? billing.country, cart.total_weight, cart.subtotal);
    if (cart.has_physical && !shipQuote.ok)
      return fail(400, { error: shipQuote.error ?? 'Nous ne livrons pas encore ce pays.', values });
    // Membres du club : port offert selon le réglage (toujours, ou commandes avec une nouveauté).
    const shippingTotal = shipQuote.ok && !(await francoPour(cart, user.id)) ? shipQuote.price : 0;

    const order = await createOrder({ customerId: user.id, email: billing.email, billing, shipping, lines: cart.lines, discount, promoCode, shippingTotal, lineDiscounts });
    // Les deux adresses sont mémorisées pour préremplir la prochaine commande.
    await query(`UPDATE $id SET billing = $b${separee ? ', shipping = $s' : ''}`, {
      id: recId('user', user.id), b: billing, s: autre
    });
    clearCart(cookies);
    clearPromoCode(cookies);

    if (isStripeEnabled()) {
      // Chaque ligne au prix remisé (Stripe n'accepte pas de ligne négative) : la remise de la ligne, répartie par exemplaire.
      const rem = new Map(lineDiscounts.map((x) => [`${String(x.id).replace(/^book:/, '')}|${x.format}`, x.discount]));
      const co = await createPaymentCheckout({
        lineItems: [
          ...cart.lines.map((l) => ({ name: `${l.title} — ${l.format}`, amount: Math.round(((l.line_total - (rem.get(`${String(l.id).replace(/^book:/, '')}|${l.format}`) ?? 0)) / l.qty) * 100), qty: l.qty })),
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
