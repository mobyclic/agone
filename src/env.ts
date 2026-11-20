/**
 * Variables d'environnement (SvelteKit 3).
 *
 * SEULES LES VARIABLES DÉCLARÉES ICI EXISTENT dans `$app/env/private`. Une variable lue
 * (`env.X`) mais absente de cette liste vaut `undefined`, sans la moindre erreur au build :
 * le paiement, les mails ou le stockage se coupent en silence. Toute nouvelle variable
 * lue par le serveur se déclare ici.
 *
 * - `static: true` : valeur figée au build (comme l'ancien `$env/static/private`).
 * - sinon : lue au démarrage du serveur (comme l'ancien `$env/dynamic/private`).
 */
import { defineEnvVars } from '@sveltejs/kit/env';

/** Facultative : absente, elle vaut `undefined` (sans schéma, SvelteKit exige qu'elle soit définie). */
const facultative = { schema: (v: string | undefined) => v };

export const variables = defineEnvVars({
  // ── Base de données : figée au build ──────────────────────────
  SURREAL_URL: { static: true, description: 'Adresse RPC de SurrealDB' },
  SURREAL_NAMESPACE: { static: true },
  SURREAL_DATABASE: { static: true },
  SURREAL_USER: { static: true },
  SURREAL_PASS: { static: true },

  // ── Site ──────────────────────────────────────────────────────
  PUBLIC_SITE_URL: facultative,
  PUBLIC_SITE_NAME: facultative,
  CRON_SECRET: { ...facultative, description: 'Secret des tâches planifiées (/api/cron/*)' },

  // ── Paiement (Stripe) ─────────────────────────────────────────
  STRIPE_SECRET_KEY: facultative,
  STRIPE_WEBHOOK_SECRET: facultative,

  // ── Mails (Resend) et newsletter (Brevo) ──────────────────────
  RESEND_API_KEY: facultative,
  MAIL_FROM: facultative,
  MAIL_REPLY_TO: facultative,
  MAIL_DRY_RUN: facultative,
  MAIL_DRY_RUN_TO: facultative,
  MAIL_PREVIEW_DIR: facultative,
  BREVO_API_KEY: facultative,
  BREVO_LIST_ID: facultative,

  // ── Stockage (Cloudflare R2) ──────────────────────────────────
  CLOUDFLARE_ACCOUNT_ID: facultative,
  CLOUDFLARE_R2_ACCESS_KEY_ID: facultative,
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: facultative,
  CLOUDFLARE_R2_BUCKET_NAME: facultative,
  CLOUDFLARE_R2_BUCKET_PRIVATE: facultative,
  CLOUDFLARE_R2_PUBLIC_URL: facultative,
  CLOUDFLARE_R2_JURISDICTION: facultative,

  // ── Les Belles Lettres (stock, commandes EDI) ─────────────────
  BL_EXTRANET_USER: facultative,
  BL_EXTRANET_PASS: facultative,
  BL_FTP_ENABLED: facultative,
  BL_FTP_HOST: facultative,
  BL_FTP_USER: facultative,
  BL_FTP_PASS: facultative,

  // ── SumUp (encaissements des rencontres) ──────────────────────
  SUMUP_API_KEY: facultative,
  SUMUP_MERCHANT_CODE: facultative,

  // ── Ancien WordPress (synchronisation, lecture seule) ─────────
  WP_DB_HOST: facultative,
  WP_DB_PORT: facultative,
  WP_DB_NAME: facultative,
  WP_DB_USER: facultative,
  WP_DB_PASS: facultative,
  WP_DB_PREFIX: facultative
});
