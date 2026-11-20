/**
 * Variables d'environnement (SvelteKit 3).
 *
 * SEULES LES VARIABLES DÉCLARÉES ICI EXISTENT dans `$app/env/private`. Une variable lue
 * (`env.X`) mais absente de cette liste vaut `undefined`, sans la moindre erreur au build :
 * le paiement, les mails ou le stockage se coupent en silence. Toute nouvelle variable
 * lue par le serveur se déclare ici.
 *
 * Toutes sont lues au démarrage du serveur (aucune n'est figée dans le build) ; `facultative` :
 * absente, elle vaut `undefined`, sinon SvelteKit refuse de démarrer sans elle.
 */
import { defineEnvVars } from '@sveltejs/kit/env';

/** Facultative : absente, elle vaut `undefined` (sans schéma, SvelteKit exige qu'elle soit définie). */
const facultative = { schema: (v: string | undefined) => v };

export const variables = defineEnvVars({
  // ── Base de données : lue au démarrage. Facultative pour SvelteKit (qui valide aussi au
  //    build, où aucun secret ne doit entrer) ; c'est la connexion qui en exige la présence. ──
  SURREAL_URL: { ...facultative, description: 'Adresse RPC de SurrealDB' },
  SURREAL_NAMESPACE: facultative,
  SURREAL_DATABASE: facultative,
  SURREAL_USER: facultative,
  SURREAL_PASS: facultative,
  SURREAL_AUTH_LEVEL: { ...facultative, description: '« database » : compte limité à la base (VPS) ; absent : compte root' },

  // ── Site ──────────────────────────────────────────────────────
  PUBLIC_SITE_URL: facultative,
  PUBLIC_SITE_NAME: facultative,
  CRON_SECRET: { ...facultative, description: 'Secret des tâches planifiées (/api/cron/*)' },

  // ── Paiement (Stripe) ─────────────────────────────────────────
  STRIPE_SECRET_KEY: facultative,
  STRIPE_WEBHOOK_SECRET: facultative,

  // ── Mails (Resend) et newsletter (Brevo) ──────────────────────
  MAIL_PROVIDER: { ...facultative, description: '« brevo » pour envoyer par Brevo ; sinon Resend' },
  RESEND_API_KEY: facultative,
  MAIL_FROM: facultative,
  MAIL_REPLY_TO: facultative,
  MAIL_DRY_RUN: facultative,
  MAIL_DRY_RUN_TO: facultative,
  MAIL_PREVIEW_DIR: facultative,
  BREVO_API_KEY: facultative,
  BREVO_LIST_ID: facultative,

  // ── Stockage Infomaniak (S3) : prioritaire dès que S3_ENDPOINT est défini ──
  S3_ENDPOINT: facultative,
  S3_REGION: facultative,
  S3_BUCKET: facultative,
  S3_ACCESS_KEY_ID: facultative,
  S3_SECRET_ACCESS_KEY: facultative,
  S3_BUCKET_PUBLIC: { ...facultative, description: 'Bucket des fichiers publics (lecture anonyme, sans listage)' },
  S3_PUBLIC_URL: { ...facultative, description: 'Adresse publique de ce bucket : https://s3.gva2.infomaniak.cloud/swift/v1/AUTH_<projet>/<bucket>' },
  FICHIERS_URL: { ...facultative, description: 'Repli sans bucket public : https://<site>/fichiers (servis par l’appli)' },

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
