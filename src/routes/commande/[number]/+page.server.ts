import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireUser } from '$lib/server/access';
import { getOrderByNumber, sessionPaiementCommande } from '$lib/server/order';
import { isStripeEnabled, STRIPE_EXTERNE } from '$lib/server/stripe';
import { isStaff } from '$lib/roles';

export const load: PageServerLoad = async ({ params, locals }) => {
  const user = requireUser(locals, `/commande/${params.number}`);
  const order = await getOrderByNumber(Number(params.number));
  if (!order) throw error(404, 'Commande introuvable');
  const owner = order.customer && String(order.customer) === user.id;
  if (!owner && !isStaff(user.role)) throw error(403, 'Cette commande ne vous appartient pas.', { code: 'FORBIDDEN' });
  // Une commande du site restée en attente (paiement abandonné) peut être payée d'ici.
  return { order, payable: order.status === 'pending' && order.channel === 'web' && isStripeEnabled() };
};

export const actions: Actions = {
  payer: async ({ params, locals, url }) => {
    const user = requireUser(locals, `/commande/${params.number}`);
    const order = await getOrderByNumber(Number(params.number));
    if (!order || (String(order.customer) !== user.id && !isStaff(user.role))) throw error(404, 'Commande introuvable');
    if (order.status !== 'pending') return fail(400, { error: 'Cette commande n’est plus en attente de paiement.' });
    let lien: string | null = null;
    try { lien = await sessionPaiementCommande(order.number, url.origin); } catch (e) { console.error('[commande] session Stripe', e); }
    if (!lien) return fail(502, { error: 'Le paiement n’a pas pu démarrer. Réessayez dans un instant.' });
    throw redirect(303, lien, STRIPE_EXTERNE);
  }
};
