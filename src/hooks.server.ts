import type { Handle } from '@sveltejs/kit';
import { getSessionUser, SESSION_COOKIE } from '$lib/server/auth/session';

export const handle: Handle = async ({ event, resolve }) => {
  // Site monolingue (fr) — pas de résolution de locale. Uniquement la session.
  const token = event.cookies.get(SESSION_COOKIE);
  event.locals.user = await getSessionUser(token);
  return resolve(event);
};
