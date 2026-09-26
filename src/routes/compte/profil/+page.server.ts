import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireUser } from '$lib/server/access';
import { setPassword, anonymiserCompte } from '$lib/server/account';
import { subscribe, unsubscribeByEmail } from '$lib/server/newsletter';
import { SESSION_COOKIE } from '$lib/server/auth/session';
import { COUNTRIES } from '$lib/countries';
import { query, recId } from '$lib/server/surreal';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ locals }) => {
  const u = requireUser(locals);
  const profile = (await query<any>(
    `SELECT first_name, last_name, email, phone, accepts_newsletter, billing, shipping FROM user WHERE id = $id LIMIT 1`,
    { id: recId('user', u.id) }
  ))[0];
  return { profile, countries: COUNTRIES };
};

/** Lit une adresse du formulaire, préfixe « » ou « ship_ ». */
function adresse(fd: FormData, prefixe = '') {
  const g = (k: string) => String(fd.get(prefixe + k) || '').trim();
  const a = {
    first_name: g('first_name'), last_name: g('last_name'),
    address_1: g('address_1'), address_2: g('address_2'),
    postcode: g('postcode'), city: g('city'), country: g('country') || 'FR', phone: g('phone')
  };
  // Une adresse sans rue ni ville n'en est pas une : on ne garde rien.
  return a.address_1 || a.city ? a : null;
}

export const actions: Actions = {
  profile: async ({ request, locals }) => {
    const u = requireUser(locals);
    const fd = await request.formData();
    const g = (k: string) => String(fd.get(k) || '').trim();
    const wantsNewsletter = fd.get('newsletter') === 'on';
    await query(`UPDATE $id SET first_name = $f, last_name = $l, phone = $p, accepts_newsletter = $n`, {
      id: recId('user', u.id), f: g('first_name'), l: g('last_name'), p: g('phone'), n: wantsNewsletter
    });
    // Synchronise la liste d'abonnés (distincte des comptes).
    if (u.email) {
      if (wantsNewsletter) await subscribe({ email: u.email, userId: u.id, first_name: g('first_name'), last_name: g('last_name'), source: 'compte' });
      else await unsubscribeByEmail(u.email);
    }
    throw redirect(303, withFlash('/compte/profil', 'Profil mis à jour.', 'success'));
  },

  /** Adresses mémorisées : elles préremplissent le paiement. */
  addresses: async ({ request, locals }) => {
    const u = requireUser(locals);
    const fd = await request.formData();
    const billing = adresse(fd);
    const shipping = fd.get('ship_same') === 'on' ? null : adresse(fd, 'ship_');
    await query(`UPDATE $id SET billing = $b, shipping = $s`, {
      id: recId('user', u.id), b: billing ?? undefined, s: shipping ?? undefined
    });
    throw redirect(303, withFlash('/compte/profil', 'Adresses enregistrées.', 'success'));
  },

  password: async ({ request, locals }) => {
    const u = requireUser(locals);
    const fd = await request.formData();
    const pw = String(fd.get('password') || '');
    if (pw.length < 8) return fail(400, { pwerror: 'Le mot de passe doit faire au moins 8 caractères.' });
    await setPassword(u.id, pw);
    throw redirect(303, withFlash('/compte/profil', 'Mot de passe modifié.', 'success'));
  },

  /** Suppression du compte : anonymisation, fermeture des sessions, déconnexion. */
  delete: async ({ request, locals, cookies }) => {
    const u = requireUser(locals);
    const fd = await request.formData();
    if (String(fd.get('confirmation') ?? '').trim().toUpperCase() !== 'SUPPRIMER') {
      return fail(400, { delerror: 'Tapez SUPPRIMER pour confirmer.' });
    }
    await anonymiserCompte(u.id);
    cookies.delete(SESSION_COOKIE, { path: '/' });
    throw redirect(303, withFlash('/', 'Votre compte a été supprimé. Vos commandes restent conservées pour la comptabilité, sans vos données personnelles.', 'info'));
  }
};
