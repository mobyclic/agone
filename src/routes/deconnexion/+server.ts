import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { destroySession, SESSION_COOKIE } from '$lib/server/auth/session';

async function logout(cookies: any) {
  const token = cookies.get(SESSION_COOKIE);
  if (token) await destroySession(token).catch(() => {});
  cookies.delete(SESSION_COOKIE, { path: '/' });
}

export const GET: RequestHandler = async ({ cookies }) => {
  await logout(cookies);
  throw redirect(303, '/');
};

export const POST: RequestHandler = async ({ cookies }) => {
  await logout(cookies);
  throw redirect(303, '/');
};
