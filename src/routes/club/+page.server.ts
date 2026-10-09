import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getClub, adhesionActive } from '$lib/server/club';
import { isStripeEnabled, createPaymentCheckout } from '$lib/server/stripe';

export const load: PageServerLoad = async ({ locals, url }) => {
  const club = await getClub();
  if (!club.active) throw error(404, { message: 'Page introuvable' });
  const adhesion = await adhesionActive(locals.user?.id);
  return { club, adhesion: adhesion ? { ends_at: adhesion.ends_at } : null, connecte: !!locals.user, merci: url.searchParams.get('merci') === '1', paiementEnLigne: isStripeEnabled() };
};

export const actions: Actions = {
  adherer: async ({ locals, url }) => {
    if (!locals.user) throw redirect(303, `/connexion?redirect=${encodeURIComponent('/club')}`);
    const club = await getClub();
    if (!club.active) return fail(400, { error: 'Le club est fermé.' });
    if (!isStripeEnabled()) return fail(400, { error: 'Le paiement en ligne est indisponible pour le moment : écrivez-nous pour adhérer.' });
    const co = await createPaymentCheckout({
      lineItems: [{ name: `Adhésion au ${club.nom} — ${club.duree_mois} mois`, amount: Math.round(club.prix_ttc * 100), qty: 1 }],
      customerEmail: locals.user.email,
      successUrl: `${url.origin}/club?merci=1`,
      cancelUrl: `${url.origin}/club`,
      metadata: { type: 'club', user: locals.user.id }
    });
    if (!co?.url) return fail(500, { error: 'Paiement impossible pour le moment.' });
    throw redirect(303, co.url);
  }
};
