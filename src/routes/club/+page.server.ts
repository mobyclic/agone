import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getClub, adhesionActive, clientStripe } from '$lib/server/club';
import { isStripeEnabled, createClubSubscriptionCheckout, createBillingPortalSession } from '$lib/server/stripe';

export const load: PageServerLoad = async ({ locals, url }) => {
  const club = await getClub();
  if (!club.active) throw error(404, { message: 'Page introuvable' });
  const adhesion = await adhesionActive(locals.user?.id);
  const client = locals.user ? await clientStripe(locals.user.id) : null;
  return {
    club, connecte: !!locals.user, merci: url.searchParams.get('merci') === '1', paiementEnLigne: isStripeEnabled(),
    adhesion: adhesion ? { ends_at: adhesion.ends_at, auto_renew: adhesion.auto_renew } : null,
    portail: !!client && isStripeEnabled()
  };
};

export const actions: Actions = {
  /** Adhésion en abonnement : renouvelée automatiquement ; un membre déjà actif ne paie qu'à la fin de sa période. */
  adherer: async ({ locals, url }) => {
    if (!locals.user) throw redirect(303, `/connexion?redirect=${encodeURIComponent('/club')}`);
    const club = await getClub();
    if (!club.active) return fail(400, { error: 'Le club est fermé.' });
    if (!isStripeEnabled()) return fail(400, { error: 'Le paiement en ligne est indisponible pour le moment : écrivez-nous pour adhérer.' });
    const [enCours, client] = await Promise.all([adhesionActive(locals.user.id), clientStripe(locals.user.id)]);
    if (enCours?.auto_renew) return fail(400, { error: 'Votre adhésion se renouvelle déjà automatiquement.' });
    let co;
    try {
      co = await createClubSubscriptionCheckout({
        nom: `Adhésion au ${club.nom}`, montant: club.prix_ttc, mois: club.duree_mois, userId: locals.user.id,
        customerId: client, customerEmail: locals.user.email, debutFacturation: enCours ? new Date(enCours.ends_at) : undefined,
        successUrl: `${url.origin}/club?merci=1`, cancelUrl: `${url.origin}/club`
      });
    } catch (e) {
      console.error('[club] session Stripe', e);
      return fail(502, { error: 'Le paiement n’a pas pu démarrer. Réessayez dans un instant.' });
    }
    if (!co?.url) return fail(500, { error: 'Paiement impossible pour le moment.' });
    throw redirect(303, co.url);
  },
  /** Portail Stripe : carte, factures, arrêt du renouvellement. */
  gerer: async ({ locals, url }) => {
    if (!locals.user) throw redirect(303, `/connexion?redirect=${encodeURIComponent('/club')}`);
    const client = await clientStripe(locals.user.id);
    if (!client) return fail(400, { error: 'Aucun abonnement en ligne à gérer.' });
    let lien: string | null = null;
    try { lien = await createBillingPortalSession(client, `${url.origin}/club`); } catch (e) { console.error('[club] portail Stripe', e); }
    if (!lien) return fail(502, { error: 'Le portail de gestion est indisponible pour le moment.' });
    throw redirect(303, lien);
  }
};
