import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { consumeMagicLink } from '$lib/server/auth/magic';
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from '$lib/server/auth/session';
import { findUserByEmail, markEmailVerified } from '$lib/server/account';
import { withFlash } from '$lib/toasts';

export const GET: RequestHandler = async ({ params, cookies, request, getClientAddress, url }) => {
  const res = await consumeMagicLink(params.token);
  if (!res) throw redirect(303, '/connexion?expired=1');

  const u = await findUserByEmail(res.email);
  if (!u) throw redirect(303, '/inscription');

  const id = String(u.id).replace(/^user:/, '');
  await markEmailVerified(id);
  const token = await createSession(id, {
    user_agent: request.headers.get('user-agent') ?? undefined,
    ip: getClientAddress()
  });
  cookies.set(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: url.protocol === 'https:',
    maxAge: SESSION_MAX_AGE
  });

  const next = res.next && res.next.startsWith('/') ? res.next : '/';
  throw redirect(303, withFlash(next, 'Email confirmé, vous êtes connecté.'));
};
