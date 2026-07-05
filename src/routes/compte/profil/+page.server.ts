import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireUser } from '$lib/server/access';
import { setPassword } from '$lib/server/account';
import { subscribe, unsubscribeByEmail } from '$lib/server/newsletter';
import { query, recId } from '$lib/server/surreal';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ locals }) => {
  const u = requireUser(locals);
  const profile = (await query<any>(
    `SELECT first_name, last_name, email, phone, accepts_newsletter, billing FROM user WHERE id = $id LIMIT 1`,
    { id: recId('user', u.id) }
  ))[0];
  return { profile };
};

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
  password: async ({ request, locals }) => {
    const u = requireUser(locals);
    const fd = await request.formData();
    const pw = String(fd.get('password') || '');
    if (pw.length < 8) return fail(400, { pwerror: 'Le mot de passe doit faire au moins 8 caractères.' });
    await setPassword(u.id, pw);
    throw redirect(303, withFlash('/compte/profil', 'Mot de passe modifié.', 'success'));
  }
};
