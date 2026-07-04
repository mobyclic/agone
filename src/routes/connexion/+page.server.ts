import { fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { verifyPassword } from '$lib/server/auth/password';
import { createOtp, verifyOtp } from '$lib/server/auth/otp';
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from '$lib/server/auth/session';
import { createMagicLink } from '$lib/server/auth/magic';
import { sendLoginEmail } from '$lib/server/mail';
import { findUserByEmail, markEmailVerified } from '$lib/server/account';

export const load: ServerLoad = ({ locals, url }) => {
  if (locals.user) throw redirect(303, safeNext(url.searchParams.get('next')));
};

function safeNext(next: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return '/';
}

function setSessionCookie(cookies: any, token: string, secure: boolean) {
  cookies.set(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: SESSION_MAX_AGE
  });
}

export const actions: Actions = {
  password: async ({ request, cookies, getClientAddress, url }) => {
    const data = await request.formData();
    const email = String(data.get('email') || '').trim().toLowerCase();
    const password = String(data.get('password') || '');
    if (!email || !password) return fail(400, { mode: 'password', email, error: 'missing' });

    const u = await findUserByEmail(email);
    if (!u || u.is_active === false || !verifyPassword(password, u.password_hash)) {
      return fail(401, { mode: 'password', email, error: 'invalid_credentials' });
    }
    const id = String(u.id).replace(/^user:/, '');
    const token = await createSession(id, {
      user_agent: request.headers.get('user-agent') ?? undefined,
      ip: getClientAddress()
    });
    setSessionCookie(cookies, token, url.protocol === 'https:');
    throw redirect(303, safeNext(url.searchParams.get('next')));
  },

  request_otp: async ({ request, url }) => {
    const data = await request.formData();
    const email = String(data.get('email') || '').trim().toLowerCase();
    if (!email) return fail(400, { mode: 'otp', email, error: 'missing' });

    const u = await findUserByEmail(email);
    // Anti-énumération : on prétend toujours que l'email est parti.
    if (u && u.is_active !== false) {
      const next = url.searchParams.get('next') ?? undefined;
      const code = await createOtp(email, 'login');
      const token = await createMagicLink(email, next);
      const link = `${url.origin}/magic/${token}`;
      const sent = await sendLoginEmail(email, { code, link });
      if (!sent.ok) console.log(`[connexion] ${email} → code ${code} · ${link}`);
    }
    return { mode: 'otp', step: 'verify', email, sent: true };
  },

  verify_otp: async ({ request, cookies, getClientAddress, url }) => {
    const data = await request.formData();
    const email = String(data.get('email') || '').trim().toLowerCase();
    const code = String(data.get('code') || '').trim();
    if (!email || !code) return fail(400, { mode: 'otp', step: 'verify', email, error: 'missing' });

    if (!(await verifyOtp(email, code, 'login')))
      return fail(401, { mode: 'otp', step: 'verify', email, error: 'invalid_code' });

    const u = await findUserByEmail(email);
    if (!u) return fail(401, { mode: 'otp', step: 'verify', email, error: 'invalid_code' });
    const id = String(u.id).replace(/^user:/, '');
    await markEmailVerified(id);
    const token = await createSession(id, {
      user_agent: request.headers.get('user-agent') ?? undefined,
      ip: getClientAddress()
    });
    setSessionCookie(cookies, token, url.protocol === 'https:');
    throw redirect(303, safeNext(url.searchParams.get('next')));
  }
};
