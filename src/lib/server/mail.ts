/**
 * Emails transactionnels via Resend.
 *
 * Variables d'env :
 *   RESEND_API_KEY   — clé API Resend (re_…). Absente → log console (dev).
 *   MAIL_FROM        — expéditeur vérifié ("Agone <hello@agone.org>")
 *   MAIL_REPLY_TO    — (optionnel) adresse de réponse
 *   MAIL_DRY_RUN     — si actif, tout est redirigé vers MAIL_DRY_RUN_TO (anti-envoi)
 *   MAIL_PREVIEW_DIR — (dev) dossier où écrire chaque e-mail en HTML AU LIEU de l'envoyer (aperçu)
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
/** Adresse publique du site, pour les liens des emails (pas d'origine de requête en tâche de fond). */
export const SITE_URL = (env.PUBLIC_SITE_URL || 'https://agone.org').replace(/\/+$/, '');

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
  /** Pièces jointes (PDF de facture…) ; le contenu part tel quel à Resend. */
  attachments?: { filename: string; content: Buffer }[];
  bypassDryRun?: boolean;
}

export async function sendMail(
  opts: SendMailOptions
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (DRY_RUN && !opts.bypassDryRun) {
    const origTo = Array.isArray(opts.to) ? opts.to.join(', ') : opts.to;
    opts = { ...opts, to: dryRunTo, subject: `[DRY-RUN → ${origTo}] ${opts.subject}` };
  }

  // Aperçu (dev) : avec MAIL_PREVIEW_DIR, l'e-mail est écrit en HTML dans ce dossier AU LIEU d'être envoyé.
  if (env.MAIL_PREVIEW_DIR) {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync(env.MAIL_PREVIEW_DIR, { recursive: true });
    const nom = `${Date.now()}-${opts.subject.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 60)}.html`;
    writeFileSync(`${env.MAIL_PREVIEW_DIR}/${nom}`, opts.html);
    return { ok: true, id: 'preview' };
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
      headers: opts.headers,
      attachments: opts.attachments?.map((a) => ({ filename: a.filename, content: a.content }))
    });
    if (res.error) return { ok: false, error: String(res.error.message ?? res.error) };
    return { ok: true, id: res.data?.id };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

/**
 * Envoi groupé (LettrInfo) : jusqu'à 100 messages par appel Resend. En mode
 * DRY_RUN, seuls les trois premiers partent, vers l'adresse de repli — un essai
 * ne doit pas inonder une boîte de mille copies.
 */
export async function sendMailBatch(
  lots: SendMailOptions[]
): Promise<{ ok: number; erreurs: string[] }> {
  if (!lots.length) return { ok: 0, erreurs: [] };
  let envois = lots;
  if (DRY_RUN) {
    envois = lots.slice(0, 3).map((o) => ({
      ...o, to: dryRunTo, subject: `[DRY-RUN → ${Array.isArray(o.to) ? o.to.join(', ') : o.to}] ${o.subject}`
    }));
  }
  const client = getClient();
  if (!client) {
    console.log(`[mail] (console) lot de ${envois.length} message(s) — ${envois[0]?.subject}`);
    return { ok: lots.length, erreurs: [] };
  }
  const erreurs: string[] = [];
  let ok = 0;
  for (let i = 0; i < envois.length; i += 100) {
    const tranche = envois.slice(i, i + 100);
    try {
      const res = await client.batch.send(
        tranche.map((o) => ({
          from: o.from || FROM, to: o.to, subject: o.subject, html: o.html, text: o.text,
          replyTo: o.replyTo || REPLY_TO, headers: o.headers
        }))
      );
      if (res.error) erreurs.push(String(res.error.message ?? res.error));
      else ok += tranche.length;
    } catch (e: any) {
      erreurs.push(String(e?.message ?? e));
    }
  }
  // En simulation, on compte comme si tout était parti : la page reste lisible.
  return { ok: DRY_RUN ? lots.length : ok, erreurs };
}

// ── Gabarit HTML minimal, sobre & éditorial (encre + rouge Agone) ──
/**
 * Charte des e-mails, reprise du site : bandeau noir et wordmark blanc, titres en
 * capitales Oswald, texte en Roboto, angles droits, boutons noirs, liens rouges.
 * Oswald/Roboto se chargent là où le client mail l'accepte (Apple Mail, iOS…) ;
 * ailleurs, repli sur Arial Narrow / Arial. Tableaux et styles en ligne pour Outlook et Gmail.
 */
export const MAIL = {
  encre: '#141414', texte: '#262626', gris: '#6b6b6b', filet: '#e4e4e4', rouge: '#d4211c', fond: '#f4f4f5',
  display: "'Oswald','Arial Narrow','Helvetica Neue',Arial,sans-serif",
  sans: "'Roboto',Arial,Helvetica,sans-serif",
  serif: "Georgia,'Times New Roman',serif"
};

const HOTE = SITE_URL.replace(/^https?:\/\//, '');

/** Le wordmark du site : A initial en italique, A et E agrandis, en blanc sur le bandeau noir. */
function wordmark(): string {
  return `<a href="${SITE_URL}" style="text-decoration:none;color:#ffffff;font-family:${MAIL.serif};font-weight:bold;font-size:26px;line-height:1;text-transform:uppercase;letter-spacing:-0.5px"><span style="font-style:italic;font-size:36px">A</span>GON<span style="font-size:36px">E</span></a>`;
}

/**
 * Gabarit commun. `surtitre` : petite ligne rouge en capitales au-dessus du titre
 * (« Commande n° 9739 ») ; `apercu` : texte d'aperçu affiché par la messagerie.
 */
export function layout(title: string, inner: string, opts: { surtitre?: string; apercu?: string } = {}): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Roboto:wght@400;700&display=swap" rel="stylesheet">
<style>@media (max-width:600px){.ag-pad{padding:26px 20px!important}.ag-h1{font-size:23px!important}} a{color:${MAIL.rouge}}</style>
</head><body style="margin:0;padding:0;background:${MAIL.fond}">
${opts.apercu ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${opts.apercu}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${MAIL.fond}"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
    <tr><td style="background:${MAIL.encre};padding:20px 28px">${wordmark()}</td></tr>
    <tr><td class="ag-pad" style="background:#ffffff;padding:34px 28px;border:1px solid ${MAIL.filet};border-top:0">
      ${opts.surtitre ? `<div style="font-family:${MAIL.display};font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${MAIL.rouge};margin:0 0 8px">${opts.surtitre}</div>` : ''}
      <h1 class="ag-h1" style="font-family:${MAIL.display};font-size:27px;line-height:1.08;font-weight:700;text-transform:uppercase;letter-spacing:0.01em;color:${MAIL.encre};margin:0 0 20px">${title}</h1>
      <div style="font-family:${MAIL.sans};font-size:15px;line-height:1.6;color:${MAIL.texte}">${inner}</div>
    </td></tr>
    <tr><td style="padding:18px 28px 6px;font-family:${MAIL.sans};font-size:12px;line-height:1.55;color:${MAIL.gris}">
      <span style="font-family:${MAIL.display};font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${MAIL.encre}">Éditions Agone</span>
      — Éditeur indépendant. Actualité &amp; histoire politiques, sciences sociales &amp; humaines.<br>
      <a href="${SITE_URL}" style="color:${MAIL.gris};text-decoration:underline">${HOTE}</a>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

/** Bouton d'action : noir, capitales Oswald, angles droits (comme « Passer commande » sur le site). */
export function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${MAIL.encre};color:#ffffff;text-decoration:none;padding:13px 24px;font-family:${MAIL.display};font-size:14px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase">${label}</a>`;
}

/** Lien de texte, rouge comme sur le site. */
export function lien(href: string, label: string): string {
  return `<a href="${href}" style="color:${MAIL.rouge};text-decoration:underline">${label}</a>`;
}

/** Petite étiquette en capitales avec le filet rouge du site (« Livraison à »). */
export function etiquette(texte: string): string {
  return `<div style="border-left:3px solid ${MAIL.rouge};padding-left:8px;font-family:${MAIL.display};font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MAIL.encre};margin:22px 0 8px">${texte}</div>`;
}

/** Note discrète (mentions, délais). */
export function note(html: string): string {
  return `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${MAIL.gris}">${html}</p>`;
}

/** Email de connexion : code OTP + lien magique. */
export async function sendLoginEmail(email: string, data: { code: string; link: string }) {
  const html = layout(
    'Votre lien de connexion',
    `<p style="margin:0 0 20px">Cliquez pour vous connecter à ${SITE} :</p>
     <p style="margin:0 0 24px">${button(data.link, 'Se connecter')}</p>
     <p style="margin:0 0 8px;color:${MAIL.gris}">Ou saisissez ce code :</p>
     <div style="display:inline-block;border:1px solid ${MAIL.filet};padding:10px 18px;font-family:${MAIL.display};font-size:30px;font-weight:700;letter-spacing:10px;color:${MAIL.encre}">${data.code}</div>
     ${note("Valable 30 minutes. Ignorez cet e-mail si vous n'êtes pas à l'origine de la demande.")}`,
    { surtitre: 'Mon compte', apercu: `Votre code : ${data.code}` }
  );
  return sendMail({ to: email, subject: `Votre code ${SITE} : ${data.code}`, html });
}

/** Email de bienvenue après inscription. */
export async function sendWelcomeEmail(email: string, data: { firstName?: string; link: string }) {
  const html = layout(
    `Bienvenue${data.firstName ? ` ${data.firstName}` : ''}`,
    `<p style="margin:0 0 20px">Votre compte ${SITE} est prêt. Confirmez votre e-mail pour accéder à votre bibliothèque et à vos commandes :</p>
     <p style="margin:0">${button(data.link, 'Confirmer mon e-mail')}</p>`,
    { surtitre: 'Mon compte', apercu: 'Confirmez votre adresse pour accéder à votre compte.' }
  );
  return sendMail({ to: email, subject: `Bienvenue sur ${SITE}`, html });
}
