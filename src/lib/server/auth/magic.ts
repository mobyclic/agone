import { RecordId } from 'surrealdb';
import { query } from '../surreal';
import { generateToken } from './password';

const TTL_MIN = 30;

/** Crée un lien magique (token à usage unique) et renvoie le token. */
export async function createMagicLink(email: string, next?: string): Promise<string> {
  const token = generateToken(32);
  await query(`CREATE $id CONTENT $d`, {
    id: new RecordId('magic_link', token),
    d: {
      email: email.toLowerCase(),
      next: next || undefined,
      expires_at: new Date(Date.now() + TTL_MIN * 60_000)
    }
  });
  return token;
}

/** Consomme un token : { email, next } si valide (non expiré, non utilisé), sinon null. */
export async function consumeMagicLink(
  token: string
): Promise<{ email: string; next?: string } | null> {
  const id = new RecordId('magic_link', token);
  const rows = await query<any>(`SELECT email, next, used, expires_at FROM $id LIMIT 1`, { id });
  const r = rows[0];
  if (!r || r.used === true) return null;
  if (new Date(r.expires_at).getTime() < Date.now()) return null;
  await query(`UPDATE $id SET used = true`, { id });
  return { email: r.email, next: r.next || undefined };
}
