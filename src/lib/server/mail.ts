/**
 * Emails transactionnels via Resend.
 *
 * Variables d'env :
 *   RESEND_API_KEY   — clé API Resend (re_…). Absente → log console (dev).
 *   MAIL_FROM        — expéditeur vérifié ("Agone <hello@agone.org>")
 *   MAIL_REPLY_TO    — (optionnel) adresse de réponse
 *   MAIL_DRY_RUN     — si actif, tout est redirigé vers MAIL_DRY_RUN_TO (anti-envoi)
 */
import { Resend } from 'resend';
import { env } from '$env/dynamic/private';

let _client: Resend | null = null;
function getClient(): Resend | null {
  if (_client) return _client;
  const key = env.RESEND_API_KEY;
  if (!key) return null;
  _client = new Resend(key);
  return _client;
}

const FROM = env.MAIL_FROM || 'Agone <onboarding@resend.dev>';
const REPLY_TO = env.MAIL_REPLY_TO;
const SITE = env.PUBLIC_SITE_NAME || 'Agone';

const DRY_RUN = ['1', 'true', 'yes', 'on'].includes((env.MAIL_DRY_RUN || '').trim().toLowerCase());
const dryRunTo = env.MAIL_DRY_RUN_TO || 'alistair.marca@gmail.com';
export function isMailDryRun() {
  return DRY_RUN;
}

export interface SendMailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  bypassDryRun?: boolean;
}

export async function sendMail(
  opts: SendMailOptions
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (DRY_RUN && !opts.bypassDryRun) {
    const origTo = Array.isArray(opts.to) ? opts.to.join(', ') : opts.to;
    opts = { ...opts, to: dryRunTo, subject: `[DRY-RUN → ${origTo}] ${opts.subject}` };
  }

  const client = getClient();
  if (!client) {
    // Dev : pas de clé Resend → on log.
    console.log(`\n[mail] (console) → ${JSON.stringify(opts.to)}\n  ${opts.subject}\n`);
    return { ok: true, id: 'console' };
  }

  try {
    const res = await client.emails.send({
      from: opts.from || FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      replyTo: opts.replyTo || REPLY_TO,
      headers: opts.headers
    });
    if (res.error) return { ok: false, error: String(res.error.message ?? res.error) };
    return { ok: true, id: res.data?.id };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

// ── Gabarit HTML minimal, sobre & éditorial (encre + rouge Agone) ──
function layout(title: string, inner: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:Georgia,'Times New Roman',serif;color:#171717">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#141414">AGONE</div>
    <div style="background:#fff;border:1px solid #e7e5e4;border-radius:14px;padding:28px;margin-top:16px">
      <h1 style="font-size:19px;margin:0 0 12px">${title}</h1>
      ${inner}
    </div>
    <p style="color:#8a857c;font-size:12px;margin-top:16px;font-family:Arial,Helvetica,sans-serif">${SITE} — éditeur engagé.</p>
  </div></body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#d4211c;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:9px;font-weight:700;font-family:Arial,Helvetica,sans-serif">${label}</a>`;
}

/** Email de connexion : code OTP + lien magique. */
export async function sendLoginEmail(email: string, data: { code: string; link: string }) {
  const html = layout(
    'Votre lien de connexion',
    `<p style="margin:0 0 16px">Cliquez pour vous connecter à ${SITE} :</p>
     <p style="margin:0 0 20px">${button(data.link, 'Se connecter')}</p>
     <p style="margin:0 0 8px;color:#57534e">Ou saisissez ce code :</p>
     <div style="font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:800;letter-spacing:8px;color:#141414">${data.code}</div>
     <p style="color:#8a857c;font-size:12px;margin-top:16px">Valable 30 minutes. Ignorez cet email si vous n'êtes pas à l'origine de la demande.</p>`
  );
  return sendMail({ to: email, subject: `Votre code ${SITE} : ${data.code}`, html });
}

/** Email de bienvenue après inscription. */
export async function sendWelcomeEmail(email: string, data: { firstName?: string; link: string }) {
  const html = layout(
    `Bienvenue${data.firstName ? ` ${data.firstName}` : ''} !`,
    `<p style="margin:0 0 16px">Votre compte ${SITE} est prêt. Confirmez votre email pour accéder à votre bibliothèque et à vos commandes :</p>
     <p>${button(data.link, 'Confirmer mon email')}</p>`
  );
  return sendMail({ to: email, subject: `Bienvenue sur ${SITE}`, html });
}
