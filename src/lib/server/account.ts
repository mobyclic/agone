import { query, recId } from './surreal';
import { hashPassword, generateToken } from './auth/password';

export interface NewUserInput {
  email: string;
  password?: string;
  first_name?: string;
  last_name?: string;
  accepts_newsletter?: boolean;
  /** Rôle initial. Défaut 'pending' ; l'inscription publique passe 'customer'. */
  role?: string;
}

export async function findUserByEmail(email: string): Promise<any | null> {
  const rows = await query<any>(
    `SELECT id, email, password_hash, is_active, email_verified, role, first_name, last_name
       FROM user WHERE email = $email LIMIT 1`,
    { email: email.toLowerCase() }
  );
  return rows[0] ?? null;
}

/** Recherche de clients (back-office) par nom ou email — pour le sélecteur de commande. */
export async function searchCustomers(qRaw: string): Promise<{ id: string; full_name: string; email?: string }[]> {
  const q = (qRaw ?? '').trim().toLowerCase();
  if (q.length < 2) return [];
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, full_name, email FROM user
       WHERE string::lowercase(full_name) CONTAINS $q OR (email ?? '') CONTAINS $q
       ORDER BY full_name ASC LIMIT 8`,
    { q }
  );
  return rows.map((r) => ({ id: r.id, full_name: r.full_name || r.email || 'Client', email: r.email ?? undefined }));
}

/** Crée un compte. Renvoie l'id brut (sans préfixe "user:"). */
export async function createUser(input: NewUserInput): Promise<string> {
  const rows = await query<any>(`CREATE user CONTENT $d`, {
    d: {
      email: input.email.toLowerCase(),
      password_hash: input.password ? hashPassword(input.password) : undefined,
      first_name: input.first_name ?? '',
      last_name: input.last_name ?? '',
      role: input.role ?? 'pending',
      accepts_newsletter: input.accepts_newsletter ?? true,
      unsubscribe_token: generateToken(16)
    }
  });
  return String(rows[0].id).replace(/^user:/, '');
}

/* ————————————————————— Back-office : fiche client ————————————————————— */

export interface UserEdit {
  id: string;
  email?: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone?: string;
  role: string;
  email_verified: boolean;
  accepts_newsletter: boolean;
  notes?: string;
  created_at?: string;
  legacy: boolean;
  orders: { number: number; status: string; total: number; channel?: string; created_at?: string }[];
}

export async function getUserForEdit(id: string): Promise<UserEdit | null> {
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, email, first_name, last_name, full_name, phone, role,
        email_verified, accepts_newsletter, notes, created_at, legacy_wp_id
      FROM user WHERE id = $id LIMIT 1`,
    { id: recId('user', id) }
  );
  const u = rows[0];
  if (!u) return null;
  const orders = await query<any>(
    `SELECT number, status, total, channel, created_at FROM order WHERE customer = $id ORDER BY created_at DESC LIMIT 100`,
    { id: recId('user', id) }
  );
  return {
    id: u.id,
    email: u.email ?? undefined,
    first_name: u.first_name ?? '',
    last_name: u.last_name ?? '',
    full_name: u.full_name || u.email || 'Client',
    phone: u.phone ?? undefined,
    role: u.role ?? 'customer',
    email_verified: u.email_verified === true,
    accepts_newsletter: u.accepts_newsletter !== false,
    notes: u.notes ?? undefined,
    created_at: u.created_at ?? undefined,
    legacy: u.legacy_wp_id != null,
    orders
  };
}

export interface UserUpdateInput {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  role?: string;
  accepts_newsletter?: boolean;
  notes?: string;
}

const USER_ROLES = ['admin', 'editor', 'customer', 'pending'];

/** Met à jour la fiche client (back-office). Lève si l'email est déjà pris. */
export async function updateUser(id: string, d: UserUpdateInput): Promise<void> {
  const set = ['first_name = $fn', 'last_name = $ln', 'accepts_newsletter = $nl', 'role = $role'];
  const vars: Record<string, unknown> = {
    id: recId('user', id),
    fn: d.first_name?.trim() ?? '',
    ln: d.last_name?.trim() ?? '',
    nl: !!d.accepts_newsletter,
    role: USER_ROLES.includes(d.role ?? '') ? d.role : 'customer'
  };
  if (d.email?.trim()) { set.push('email = $email'); vars.email = d.email.trim().toLowerCase(); }
  else set.push('email = NONE');
  if (d.phone?.trim()) { set.push('phone = $phone'); vars.phone = d.phone.trim(); }
  else set.push('phone = NONE');
  if (d.notes?.trim()) { set.push('notes = $notes'); vars.notes = d.notes.trim(); }
  else set.push('notes = NONE');
  await query(`UPDATE $id SET ${set.join(', ')}`, vars);
}

/** Valide l'email et promeut pending → customer. */
export async function markEmailVerified(userId: string): Promise<void> {
  await query(
    `UPDATE $id SET email_verified = true, role = IF role = 'pending' THEN 'customer' ELSE role END`,
    { id: recId('user', userId) }
  );
}

export async function setPassword(userId: string, password: string): Promise<void> {
  await query(`UPDATE $id SET password_hash = $h`, {
    id: recId('user', userId),
    h: hashPassword(password)
  });
}
