# Hébergement Infomaniak (VPS, Coolify)

État au 21 novembre 2026 : AGONE tourne **uniquement** chez Infomaniak, sur https://agone.dev.mobyclic.com,
protégé par Tinyauth (connexion auth.mobyclic.com), construit depuis la branche **`majeures`** et redéployé
à chaque push. **Railway est arrêté** (déploiement retiré, service conservé) ; Surreal Cloud et R2 ne sont
plus utilisés mais pas encore supprimés. agone.org est toujours le WordPress.

## Ce qui tourne

| Rôle | Où | Détail |
|---|---|---|
| Application | Coolify, projet « agone », appli `agone` (`cjub1m6uuj97tdhlgx09kzug`) | `Dockerfile` : Bun 1.4.5 pour construire, **Node 26** pour exécuter ; santé `/api/sante` ; webhook GitHub « push » → redéploiement |
| Base | SurrealDB 3.3.5 partagé du VPS, `mobyclic/agone` — **base unique**, pas de base de dev | compte `agone` limité à la base (EDITOR), `SURREAL_AUTH_LEVEL=database` ; identifiants dans `~/.agone-surreal-vps.env` ; depuis le poste : https://surreal.mobyclic.com/rpc (IP d'Alistair seulement) |
| Fichiers publics | bucket **`agone-public`** | couvertures, portraits, images : lus **directement** chez Infomaniak (`S3_PUBLIC_URL/<clé>`), l'appli n'est pas dans le chemin. Lecture anonyme autorisée par règle de bucket ; listage, écriture et suppression anonymes refusés |
| Fichiers privés | bucket **`agone`** | ebooks, contrats, factures, carnets : servis par l'appli après contrôle des droits |
| Mails | Resend (`MAIL_PROVIDER=resend`), `MAIL_DRY_RUN=true` | le code Brevo est prêt (`MAIL_PROVIDER=brevo`) : il faudra un compte Brevo pour Agone et agone.org authentifié (DKIM, DMARC) |
| Paiement | Stripe **mode test** | endpoint `we_1UdvodRrPqwVOBCQr0P1JZYQ`, version `2026-11-18.endive`, 4 événements ; secret dans `~/.agone-stripe-webhook-essai.txt` |
| Sauvegarde | `/opt/backup/backup-surreal.sh`, chaque nuit à 2 h 15 UTC | `mobyclic/agone` est prise d'office (seules les bases `_dev` / `_test` sont ignorées) |

L'adresse publique d'un fichier est de la forme
`https://s3.gva2.infomaniak.cloud/swift/v1/AUTH_<projet>/agone-public/livres/couvertures/<isbn>.webp`
(le stockage Infomaniak exige le projet dans l'adresse pour un accès anonyme). Elle ne dépend pas du
domaine du site : rien à réécrire le jour où agone.org bascule. Les anciennes adresses
`/fichiers/<clé>` redirigent (301) vers elle.

**Accès sans Tinyauth** (routeur Traefik `public-…`) : `/api/stripe/webhook`, `/api/cron/*`,
`/fichiers/*`, `/api/sante`. Tout le reste demande la connexion. En-tête `X-Robots-Tag: noindex`.

Les labels Traefik sont **manuels** (Coolify ne les régénère plus) : repasser en mode géré avant de
changer de domaine, ou réécrire les labels avec le nouveau nom d'hôte.

## Variables de l'appli (toutes lues au démarrage, aucune au build)

`SURREAL_URL` (`http://surrealdb-ljvt0vwxl3jrtdniogamdbbt:8000/rpc`), `SURREAL_NAMESPACE`, `SURREAL_DATABASE`,
`SURREAL_USER`, `SURREAL_PASS`, `SURREAL_AUTH_LEVEL` · `ORIGIN`, `PUBLIC_SITE_URL`, `PUBLIC_SITE_NAME` ·
`CRON_SECRET` · `STRIPE_SECRET_KEY` (test), `STRIPE_WEBHOOK_SECRET` · `MAIL_PROVIDER`, `RESEND_API_KEY`, `MAIL_FROM`,
`MAIL_REPLY_TO`, `MAIL_DRY_RUN`, `MAIL_DRY_RUN_TO` · `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` (privé),
`S3_BUCKET_PUBLIC`, `S3_PUBLIC_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `FICHIERS_URL` (repli) ·
`BL_EXTRANET_USER`, `BL_EXTRANET_PASS`, `BL_FTP_ENABLED=false` · `WP_DB_HOST`, `WP_DB_NAME`, `WP_DB_USER`, `WP_DB_PASS`.

Toute variable lue par le code doit être **déclarée dans `src/env.ts`** (sinon elle vaut `undefined`).

## Le passage sur agone.org (le jour où le site remplace le WordPress)

La base et les fichiers sont déjà en place : il ne reste que l'adresse et les réglages de production.

1. **Coolify** : domaine `https://agone.org` (et www), labels sans Tinyauth ni `noindex` ; `ORIGIN` et
   `PUBLIC_SITE_URL` sur agone.org.
2. **Stripe** : clés **live** et nouvel endpoint live (`https://agone.org/api/stripe/webhook`).
3. **Mails** : `MAIL_DRY_RUN=false` (Brevo si le domaine est authentifié).
4. **Belles Lettres** : `BL_FTP_ENABLED=true` quand l'envoi est validé ; tâches planifiées (cf. `docs/CRONS.md`,
   avec `Content-Type: application/json`).
5. **DNS** d'agone.org vers le VPS (200.234.65.237), vérifier le certificat et le site.
6. **Fusion** de `majeures` dans `main` (et brancher Coolify sur `main`).
7. **Railway, bucket R2, base Surreal Cloud** : supprimés seulement avec accord.

## Scripts liés

- `scripts/reecrire-adresses-fichiers.ts` : réécrit `media.url` d'une racine à l'autre (refuse Surreal Cloud).
- `scripts/copier-fichiers-r2-vers-s3.ts` : copie R2 → Infomaniak (publics vers `agone-public`, privés vers `agone`) ;
  ne sert plus que si l'on rapatriait de nouveaux fichiers de R2.
