# Tâches planifiées

Le dépôt ne planifie rien lui-même : chaque tâche est un `POST` sur une route
gardée par `CRON_SECRET` (en-tête `x-cron-secret` ou paramètre `?secret=`).
La planification se fait dans Railway (service « cron ») ou n'importe quel
ordonnanceur externe.

| Route | Quand | Ce qu'elle fait |
|---|---|---|
| `POST /api/cron/bl-stock` | chaque nuit, 5 h | Relit le stock BLDD (`stocks.asp`) et écrase `book.stock_qty`. Lecture seule côté distributeur. |
| `POST /api/cron/bl-orders` | 2×/jour, 11 h et 17 h | Exporte les commandes à transmettre aux Belles Lettres (fichier EDI). **L'envoi FTP reste désactivé (`BL_FTP_ENABLED=false`) tant que le site n'est pas en production** : dry-run vers un dossier local. |
| `POST /api/cron/bl-mouvements` | le 4 de chaque mois, 6 h | Mouvements de stock du mois écoulé (fabrication, sorties, SP, stock d'ouverture et de clôture) pour les redditions de droits. Une requête. |
| `POST /api/cron/club-rappels` | chaque jour, 9 h | Écrit aux membres du club dont l'adhésion se renouvelle automatiquement et arrive à échéance dans 15 jours (un seul e-mail par période, `reminder_sent_at`). |
| `POST /api/cron/sumup` | chaque nuit, 5 h 30 | Relève les encaissements SumUp des dix derniers jours et les rapproche des rencontres du jour et du catalogue (`SUMUP_API_KEY`). Ce qui ne se rapproche pas tout seul attend dans `/admin/canaux/sumup`. |

Exemple, tel qu'on le donne à Railway :

```
curl -sf -X POST -H "x-cron-secret: $CRON_SECRET" https://agone.org/api/cron/bl-stock
```

Chaque route répond en JSON (`{ ok, … }`) et en 500 en cas d'échec, pour que
l'ordonnanceur puisse alerter. Les emails de compte rendu (diff de stock)
partent via Resend et suivent `MAIL_DRY_RUN`.
