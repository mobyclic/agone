import { createHash, randomInt } from 'node:crypto';
import { query, recId } from '../surreal';

const OTP_TTL_MIN = 10;
const OTP_MAX_ATTEMPTS = 5;

export type OtpPurpose = 'login' | 'verify_email' | 'application';

function hashCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Crée un OTP, invalide les précédents pour la même paire (email, purpose). */
export async function createOtp(email: string, purpose: OtpPurpose = 'login') {
  const code = generateOtpCode();
  const expires = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);
  await query(`UPDATE email_otp SET used = true WHERE email = $email AND purpose = $purpose AND used = false`, {
    email,
    purpose
  });
  await query(
    `CREATE email_otp CONTENT { email: $email, purpose: $purpose, code_hash: $code_hash, expires_at: $expires_at }`,
    { email, purpose, code_hash: hashCode(code), expires_at: expires }
  );
  return code;
}

/** Vérifie l'OTP : true si valide (et le marque used). */
export async function verifyOtp(email: string, code: string, purpose: OtpPurpose = 'login'): Promise<boolean> {
  const rows = await query<any>(
    `SELECT id, code_hash, attempts, created_at FROM email_otp
     WHERE email = $email AND purpose = $purpose AND used = false AND expires_at > time::now()
     ORDER BY created_at DESC LIMIT 1`,
    { email, purpose }
  );
  const otp = rows[0];
  if (!otp) return false;
  const otpId = recId('email_otp', String(otp.id));
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await query(`UPDATE $id SET used = true`, { id: otpId });
    return false;
  }
  if (otp.code_hash !== hashCode(code)) {
    await query(`UPDATE $id SET attempts = attempts + 1`, { id: otpId });
    return false;
  }
  await query(`UPDATE $id SET used = true`, { id: otpId });
  return true;
}
