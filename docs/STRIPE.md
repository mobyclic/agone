# Paiement en ligne (Stripe) — mise en service

État au 10 octobre 2026 : le code est prêt (SDK `stripe` 23, API `2026-09-30.endive`), mais **aucune clé Stripe
n'est configurée en production** : la caisse affiche « Le paiement en ligne sera activé prochainement » et les
commandes du site restent « en attente ».

## 1. Variables Railway (service AGONE)

| Variable | Valeur |
|---|---|
| `STRIPE_SECRET_KEY` | clé secrète (`sk_live_…`, ou `sk_test_…` pour une recette) |
| `STRIPE_WEBHOOK_SECRET` | secret de signature de l'endpoint (`whsec_…`) — **obligatoire** : sans lui le webhook refuse tout |

## 2. Endpoint webhook (tableau de bord Stripe › Développeurs › Webhooks)

URL : `https://<domaine>/api/stripe/webhook` — événements :

- `checkout.session.completed` — commande payée ; client Stripe d'un membre du club
- `invoice.paid` — adhésion au club : première période et chaque renouvellement
- `customer.subscription.updated` et `customer.subscription.deleted` — arrêt du renouvellement

## 3. Portail client (Paramètres › Facturation › Portail client)

Activer le portail (carte, factures, **annulation en fin de période**) : le bouton « Gérer mon abonnement »
de la page `/club` y renvoie le membre.

## 4. Recommandé

- E-mails Stripe : reçus de paiement, échec de paiement. Le rappel 15 jours avant le renouvellement est envoyé
  par le site (`/api/cron/club-rappels`, à planifier chaque jour) : inutile d'activer celui de Stripe en plus.
- Faire une recette en mode test (`sk_test_…`) : une commande papier, une commande ePub, une adhésion.

## Ce que fait le site

- **Commande** : la caisse crée la commande (lignes, remise par ligne, port) puis la session Checkout ; le
  webhook la marque payée → facture réglée (égale au montant payé : remise et port compris), ePub dans la
  bibliothèque, e-mail de confirmation, export EDI vers Les Belles Lettres (FTP toujours désactivé : fichier
  stagé). Une commande abandonnée se paie plus tard depuis sa page (« Payer maintenant »).
- **Club** : abonnement Stripe (prix récurrent créé à la volée, tous les `duree_mois` mois). Chaque facture
  payée ajoute une période d'adhésion et sa facture Agone ; un membre déjà actif ne paie qu'à la fin de sa
  période (essai jusque-là). Les adhésions saisies à la main (chèque, offertes) ne se renouvellent pas.
