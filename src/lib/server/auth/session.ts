import { RecordId } from 'surrealdb';
import { query, recId } from '../surreal';
import { generateToken } from './password';
import type { Role } from '$lib/roles';

export const SESSION_COOKIE = 'ag_session';
const SESSION_DAYS = 30;
export const SESSION_MAX_AGE = SESSION_DAYS * 86400;

export async function createSession(
  userId: string,
  meta?: { user_agent?: string; ip?: string }
): Promise<string> {
  const token = generateToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400 * 1000);
  await query('CREATE $id CONTENT $data', {
    id: new RecordId('session', token),
    data: {
      user: recId('user', userId),
      expires_at: expires,
      user_agent: meta?.user_agent,
      ip: meta?.ip
    }
  });
  return token;
}

type SessionUser = NonNullable<App.Locals['user']>;

export async function getSessionUser(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const rows = await query<any>(
    `SELECT *, user.* AS user FROM session WHERE id = $id AND expires_at > time::now() LIMIT 1;`,
    { id: new RecordId('session', token) }
  );
  const row = rows[0];
  if (!row?.user) return null;
  const u = row.user;
  if (u.is_active === false) return null;

  return {
    id: String(u.id),
    email: u.email as string,
    first_name: u.first_name,
    last_name: u.last_name,
    full_name: u.full_name,
    slug: u.slug,
    avatar_url: u.avatar?.url ?? undefined,
    role: (u.role ?? 'pending') as Role,
    email_verified: u.email_verified === true
  };
}

export async function destroySession(token: string) {
  await query('DELETE $id', { id: new RecordId('session', token) });
}

/** Purge des sessions expirées (à appeler via un cron/route admin). */
export async function purgeExpiredSessions() {
  await query('DELETE session WHERE expires_at < time::now()');
}
