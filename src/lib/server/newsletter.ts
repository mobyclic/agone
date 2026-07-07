/**
 * Newsletter — liste d'abonnés DISTINCTE des comptes `user` (table
 * `newsletter_subscriber`). Un invité peut s'abonner ; un `user` peut
 * s'abonner / se désabonner, et `user.accepts_newsletter` reste synchronisé.
 * Source de vérité locale ; poussée best-effort vers Brevo si configuré.
 */
import { query, recId } from './surreal';
import { generateToken } from './auth/password';
import { env } from '$env/dynamic/private';

const norm = (email: string) => email.trim().toLowerCase();
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(norm(email));
}

export interface SubscribeInput {
  email: string;
  userId?: string;
  first_name?: string;
  last_name?: string;
  source?: string;
}
export type SubscribeResult = 'subscribed' | 'resubscribed' | 'already';

export async function subscribe(input: SubscribeInput): Promise<SubscribeResult> {
  const email = norm(input.email);
  const existing = await query<any>(
    `SELECT meta::id(id) AS pid, status FROM newsletter_subscriber WHERE email = $e LIMIT 1`,
    { e: email }
  );
  let result: SubscribeResult;

  if (existing[0]?.pid) {
    const wasSubscribed = existing[0].status === 'subscribed';
    let sql = `status = 'subscribed', subscribed_at = time::now(), unsubscribed_at = NONE`;
    const vars: Record<string, unknown> = { id: recId('newsletter_subscriber', existing[0].pid) };
    if (input.userId) { sql += ', user = $u'; vars.u = recId('user', input.userId); }
    if (input.first_name) { sql += ', first_name = $fn'; vars.fn = input.first_name; }
    if (input.last_name) { sql += ', last_name = $ln'; vars.ln = input.last_name; }
    await query(`UPDATE $id SET ${sql}`, vars);
    result = wasSubscribed ? 'already' : 'resubscribed';
  } else {
    const token = generateToken(24);
    let sql = `email = $e, status = 'subscribed', token = $t, source = $src, subscribed_at = time::now()`;
    const vars: Record<string, unknown> = { e: email, t: token, src: input.source || 'site' };
    if (input.userId) { sql += ', user = $u'; vars.u = recId('user', input.userId); }
    if (input.first_name) { sql += ', first_name = $fn'; vars.fn = input.first_name; }
    if (input.last_name) { sql += ', last_name = $ln'; vars.ln = input.last_name; }
    await query(`CREATE newsletter_subscriber SET ${sql}`, vars);
    result = 'subscribed';
  }

  if (input.userId) await query(`UPDATE $id SET accepts_newsletter = true`, { id: recId('user', input.userId) });
  void syncBrevo(email, 'subscribe', input);
  return result;
}

async function markUnsubscribed(pid: string, email: string, userRef: unknown): Promise<void> {
  await query(`UPDATE $id SET status = 'unsubscribed', unsubscribed_at = time::now()`, { id: recId('newsletter_subscriber', pid) });
  if (userRef) {
    const uid = String(userRef).replace(/^user:/, '');
    await query(`UPDATE $u SET accepts_newsletter = false`, { u: recId('user', uid) });
  }
  void syncBrevo(email, 'unsubscribe');
}

/** Désabonnement par jeton (lien d'e-mail, un clic). Renvoie l'e-mail si trouvé. */
export async function unsubscribeByToken(token: string): Promise<string | null> {
  const rows = await query<any>(`SELECT meta::id(id) AS pid, email, user FROM newsletter_subscriber WHERE token = $t LIMIT 1`, { t: token });
  if (!rows[0]?.pid) return null;
  await markUnsubscribed(rows[0].pid, rows[0].email, rows[0].user);
  return rows[0].email;
}

/** Désabonnement par e-mail (profil / admin). */
export async function unsubscribeByEmail(email: string): Promise<boolean> {
  const rows = await query<any>(`SELECT meta::id(id) AS pid, email, user FROM newsletter_subscriber WHERE email = $e LIMIT 1`, { e: norm(email) });
  if (!rows[0]?.pid) return false;
  await markUnsubscribed(rows[0].pid, rows[0].email, rows[0].user);
  return true;
}

export async function isSubscribed(email: string): Promise<boolean> {
  const rows = await query<any>(`SELECT id FROM newsletter_subscriber WHERE email = $e AND status = 'subscribed' LIMIT 1`, { e: norm(email) });
  return rows.length > 0;
}

export interface SubscriberRow {
  id: string; email: string; status: string; source: string;
  first_name?: string; last_name?: string; created_at?: string; is_user: boolean;
}

export async function listSubscribers(opts: { q?: string; status?: string; limit?: number; offset?: number } = {}): Promise<{ subscribers: SubscriberRow[]; total: number }> {
  const where: string[] = [];
  const vars: Record<string, unknown> = { limit: opts.limit ?? 50, start: opts.offset ?? 0 };
  if (opts.status) { where.push('status = $status'); vars.status = opts.status; }
  if (opts.q && opts.q.trim()) { vars.q = opts.q.trim().toLowerCase(); where.push('email CONTAINS $q'); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await query<any>(
    `SELECT meta::id(id) AS pid, email, status, source, first_name, last_name, created_at, user FROM newsletter_subscriber ${whereSql} ORDER BY created_at DESC LIMIT $limit START $start`,
    vars
  );
  const count = await query<any>(`SELECT count() AS n FROM newsletter_subscriber ${whereSql} GROUP ALL`, vars);
  const subscribers = rows.map((r) => ({
    id: r.pid, email: r.email, status: r.status, source: r.source ?? 'site',
    first_name: r.first_name ?? undefined, last_name: r.last_name ?? undefined,
    created_at: r.created_at ?? undefined, is_user: !!r.user
  }));
  return { subscribers, total: count[0]?.n ?? 0 };
}

export interface SubscriberStats { total: number; subscribed: number; unsubscribed: number }
export async function subscriberStats(): Promise<SubscriberStats> {
  const rows = await query<any>(`SELECT status, count() AS n FROM newsletter_subscriber GROUP BY status`);
  let subscribed = 0, unsubscribed = 0;
  for (const r of rows) {
    if (r.status === 'subscribed') subscribed = r.n ?? 0;
    else if (r.status === 'unsubscribed') unsubscribed = r.n ?? 0;
  }
  return { total: subscribed + unsubscribed, subscribed, unsubscribed };
}

/** Seed : ajoute les clients (`user.accepts_newsletter = true`) absents de la liste. */
export async function seedFromUsers(): Promise<{ added: number }> {
  const users = await query<any>(
    `SELECT meta::id(id) AS pid, email, first_name, last_name FROM user WHERE accepts_newsletter = true AND email != NONE`
  );
  let added = 0;
  for (const u of users) {
    const email = norm(String(u.email));
    const ex = await query<any>(`SELECT id FROM newsletter_subscriber WHERE email = $e LIMIT 1`, { e: email });
    if (ex.length) continue;
    const token = generateToken(24);
    await query(
      `CREATE newsletter_subscriber SET email = $e, status = 'subscribed', token = $t, source = 'import', user = $u, first_name = $fn, last_name = $ln, subscribed_at = time::now()`,
      { e: email, t: token, u: recId('user', u.pid), fn: u.first_name || null, ln: u.last_name || null }
    );
    added++;
  }
  return { added };
}

/* ————————————————————— Numéros (LettrInfo = article is_newsletter_issue) ————————————————————— */

export interface NewsletterIssueRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  published_at?: string;
  book_count: number;
}

export async function listNewsletterIssues(limit = 60): Promise<NewsletterIssueRow[]> {
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, title, slug, status, published_at, array::len(books ?? []) AS book_count
       FROM article WHERE is_newsletter_issue = true ORDER BY published_at DESC LIMIT $limit`,
    { limit }
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    status: r.status ?? 'draft',
    published_at: r.published_at ?? undefined,
    book_count: r.book_count ?? 0
  }));
}

/* ————————————————————— Brevo (best-effort, optionnel) ————————————————————— */

async function syncBrevo(email: string, action: 'subscribe' | 'unsubscribe', input?: SubscribeInput): Promise<void> {
  const key = env.BREVO_API_KEY;
  if (!key) return;
  const listId = env.BREVO_LIST_ID ? Number(env.BREVO_LIST_ID) : undefined;
  try {
    if (action === 'subscribe') {
      await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: { 'api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({
          email, updateEnabled: true,
          attributes: { PRENOM: input?.first_name, NOM: input?.last_name },
          listIds: listId ? [listId] : undefined
        })
      });
    } else {
      await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
        method: 'PUT',
        headers: { 'api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({ emailBlacklisted: true, ...(listId ? { unlinkListIds: [listId] } : {}) })
      });
    }
  } catch {
    /* best-effort : la source de vérité reste locale */
  }
}
