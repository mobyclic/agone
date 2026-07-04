import { fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { createUser, findUserByEmail } from '$lib/server/account';
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from '$lib/server/auth/session';
import { createMagicLink } from '$lib/server/auth/magic';
import { sendWelcomeEmail } from '$lib/server/mail';
import { withFlash } from '$lib/toasts';

export const load: ServerLoad = ({ locals, url }) => {
  if (locals.user) throw redirect(303, url.searchParams.get('next') || '/');
};

function safeNext(next: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return '/';
}

export const actions: Actions = {
  default: async ({ request, cookies, getClientAddress, url }) => {
    const data = await request.formData();
    const email = String(data.get('email') || '').trim().toLowerCase();
    const password = String(data.get('password') || '');
    const first_name = String(data.get('first_name') || '').trim();
    const last_name = String(data.get('last_name') || '').trim();
    const accepts_newsletter = data.get('newsletter') === 'on';
    const values = { email, first_name, last_name };

    if (!email || !password) return fail(400, { ...values, error: 'missing' });
    if (password.length < 8) return fail(400, { ...values, error: 'weak_password' });
    if (await findUserByEmail(email)) return fail(409, { ...values, error: 'email_taken' });

    const id = await createUser({
      email,
      password,
      first_name,
      last_name,
      accepts_newsletter,
      role: 'customer'
    });

    // Email de confirmation (soft — l'accès est déjà accordé).
    try {
      const token = await createMagicLink(email, safeNext(url.searchParams.get('next')));
      await sendWelcomeEmail(email, { firstName: first_name, link: `${url.origin}/magic/${token}` });
    } catch (e) {
      console.error('[inscription] welcome mail', e);
    }

    const session = await createSession(id, {
      user_agent: request.headers.get('user-agent') ?? undefined,
      ip: getClientAddress()
    });
    cookies.set(SESSION_COOKIE, session, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: url.protocol === 'https:',
      maxAge: SESSION_MAX_AGE
    });

    throw redirect(303, withFlash(safeNext(url.searchParams.get('next')), 'Bienvenue sur Agone !'));
  }
};
