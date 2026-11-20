# Hébergement Infomaniak (VPS, Coolify)

État au 20 novembre 2026 : **essai** sur https://agone.dev.mobyclic.com, protégé par Tinyauth
(connexion auth.mobyclic.com), construit depuis la branche **`majeures`**. La production tourne encore
sur Railway (`main`, Surreal Cloud, Cloudflare R2) ; agone.org est toujours le WordPress.

## Ce qui tourne

| Rôle | Où | Détail |
|---|---|---|
| Application | Coolify, projet « agone », appli `agone` (`cjub1m6uuj97tdhlgx09kzug`) | `Dockerfile` : Bun 1.4.5 pour construire, **Node 26** pour exécuter ; santé `/api/sante` |
| Base | SurrealDB 3.3.5 partagé du VPS, `mobyclic/agone` | compte `agone` limité à la base (EDITOR), `SURREAL_AUTH_LEVEL=database` ; identifiants dans `~/.agone-surreal-vps.env` |
| Fichiers | Stockage d'objets Infomaniak, bucket **privé** `agone` | l'appli sert les fichiers publics sur `/fichiers/<clé>` ; ebooks, contrats, factures, carnets ne passent jamais par là |
| Mails | Resend (`MAIL_PROVIDER=resend`), `MAIL_DRY_RUN=true` | le code Brevo est prêt (`MAIL_PROVIDER=brevo`) : il faudra un compte Brevo pour Agone et agone.org authentifié (DKIM, DMARC) |
| Paiement | Stripe **mode test** | endpoint `we_1UdvodRrPqwVOBCQr0P1JZYQ`, version `2026-11-18.endive`, 4 événements ; secret dans `~/.agone-stripe-webhook-essai.txt` |
| Sauvegarde | `/opt/backup/backup-surreal.sh`, chaque nuit à 2 h 15 UTC | `mobyclic/agone` est prise d'office (seules les bases `_dev` / `_test` sont ignorées) |

**Accès sans Tinyauth** (routeur Traefik `public-…`) : `/api/stripe/webhook`, `/api/cron/*`,
`/fichiers/*`, `/api/sante`. Tout le reste demande la connexion. En-tête `X-Robots-Tag: noindex`.

Les labels Traefik sont **manuels** (Coolify ne les régénère plus) : repasser en mode géré avant de
changer de domaine, ou réécrire les labels avec le nouveau nom d'hôte.

## Variables de l'appli (toutes lues au démarrage, aucune au build)

`SURREAL_URL` (`http://surrealdb-ljvt0vwxl3jrtdniogamdbbt:8000/rpc`), `SURREAL_NAMESPACE`, `SURREAL_DATABASE`,
`SURREAL_USER`, `SURREAL_PASS`, `SURREAL_AUTH_LEVEL` · `ORIGIN`, `PUBLIC_SITE_URL`, `PUBLIC_SITE_NAME` ·
`CRON_SECRET` · `STRIPE_SECRET_KEY` (test), `STRIPE_WEBHOOK_SECRET` · `MAIL_PROVIDER`, `RESEND_API_KEY`, `MAIL_FROM`,
`MAIL_REPLY_TO`, `MAIL_DRY_RUN`, `MAIL_DRY_RUN_TO` · `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`, `FICHIERS_URL` (`https://<site>/fichiers`) · `BL_EXTRANET_USER`, `BL_EXTRANET_PASS`,
`BL_FTP_ENABLED=false` · `WP_DB_HOST`, `WP_DB_NAME`, `WP_DB_USER`, `WP_DB_PASS`.

Toute variable lue par le code doit être **déclarée dans `src/env.ts`** (sinon elle vaut `undefined`).

## La bascule (le jour où agone.org passe sur le nouveau site)

La base du VPS et le bucket sont une **répétition** : Railway continue d'écrire dans Surreal Cloud et R2.
Le jour J, on rejoue tout depuis la production du moment :

1. **Geler les saisies** sur Railway (back-office) le temps de la bascule.
2. **Base** : exporter Surreal Cloud (`surreal export`), vider `mobyclic/agone` sur le VPS
   (`REMOVE DATABASE agone` puis recréer la base et le compte `agone`), importer **dans le conteneur**
   (`docker cp` puis `/surreal import`), comparer les comptes de lignes table par table.
3. **Fichiers** : `railway variables --service agone --json | bun run scripts/copier-fichiers-r2-vers-s3.ts`
   (ne recopie que ce qui manque).
4. **Adresses** : `bun run scripts/reecrire-adresses-fichiers.ts --vers https://agone.org/fichiers --ecrire`
   (avec les `SURREAL_*` du VPS, par le tunnel SSH ; le script refuse Surreal Cloud).
5. **Coolify** : domaine `https://agone.org` (et www), labels sans Tinyauth ni `noindex`, `ORIGIN`,
   `PUBLIC_SITE_URL` et `FICHIERS_URL` sur agone.org ; clés Stripe **live** et nouvel endpoint live ;
   `MAIL_DRY_RUN=false` ; `BL_FTP_ENABLED=true` quand l'envoi aux Belles Lettres est validé ; tâches
   planifiées (cf. `docs/CRONS.md`, avec `Content-Type: application/json`).
6. **DNS** d'agone.org vers le VPS (200.234.65.237), vérifier le certificat et le site.
7. **Railway, bucket R2, base Surreal Cloud** : arrêtés seulement après accord, quelques jours plus tard.

## À faire côté Alistair

- GitHub › Settings › Applications › **coolify-mobyclic** › Configure : donner accès au dépôt
  `mobyclic/agone` (pour le redéploiement automatique à chaque push ; l'essai est pour l'instant
  branché en dépôt public).
- SiteGround : autoriser l'adresse du VPS (200.234.65.237) pour la synchronisation WordPress (MySQL).
