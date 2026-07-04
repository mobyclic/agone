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
