# AGONE 2.0 — Décisions produit & contraintes

Décisions actées avec le porteur (Alistair). À respecter dans l'architecture et le build.

## Actées
- **Monolingue français.** Le site est en français uniquement. → On NE reprend PAS la couche i18n FR/EN de FEEDSOURCING : pas de `src/lib/i18n`, pas de champs `*_i18n` en base, pas de `LanguageSwitcher` ni `/set-locale`. Le contenu éditorial est stocké en texte simple. (On garde des libellés centralisés éventuels, mais pas de mécanisme multilingue.)
- **Stack imposée** = celle de FEEDSOURCING : SvelteKit 5 (runes) + adapter-node + SurrealDB cloud (HTTP) + Tailwind 4 + shadcn-svelte + Cloudflare R2 + Resend + Stripe + bun. Déploiement Railway.
- **Repo** : `git@github.com:mobyclic/agone.git`. `.env` déjà rempli (R2 bucket `agone`, Surreal DB `agone`/ns `mobyclic`, Resend, Anthropic). Stripe à renseigner.
- **Serveur de prod actuel = LECTURE SEULE.** WordPress/WooCommerce sur SiteGround (`c120581.sgvps.net:18765`). On peut lire fichiers + BDD MySQL (`[REDACTED-DB]`, préfixe `wri_`) pour migrer, mais NE RIEN modifier.

## Intégration Belles Lettres (distributeur)
- Garder les 2 jobs : **import stock** (`majstockbl.php` → parse fichier Excel/FTP) et **export commandes** (`sendcomtobl.php` → dépôt fichier sur FTP BL, 2×/jour).
- **Tant que ce n'est pas en prod : AUCUN envoi sur le FTP des Belles Lettres.** L'export commandes doit fonctionner en dry-run (génération du fichier dans un dossier local `tosend/`, sans upload). La récupération de stock est autorisée.
- Opportunité d'amélioration acceptée (moderniser le format/robustesse), à cadrer.

## Nouveauté majeure : Droits d'auteur (back-office)
Module back-office de gestion des **droits d'auteur / redevances**. **Rien n'existe aujourd'hui** sur le site → conception from scratch. Exigences du porteur :

- **Contributeurs multiples par livre**, avec **rôles** : auteur (1..n), éditeur, traducteur (1..n), préfacier, illustrateur… (rôles extensibles). Le lien livre↔contributeur porte le rôle.
- **Contrat spécifique par livre × contributeur** : taux de redevance, éventuel à-valoir/avance, base de calcul (prix public HT / net éditeur / nombre d'ex.).
- **Taux par paliers / tranches de ventes** (droits progressifs) : ex. 8 % jusqu'à 2 000 ex., 10 % de 2 001 à 5 000, 12 % au-delà. Le moteur applique le bon taux selon le cumul de ventes atteint. Chaque contrat porte un barème de tranches ordonné.
- **Ventes multi-canaux** : le calcul agrège les ventes par **canal** (site direct, distributeur Belles Lettres, + **autres canaux à ajouter** plus tard → modèle de vente/`sales_channel` extensible). Import possible de relevés de ventes externes.
- **Reddition de comptes** générée automatiquement : par titre, par contributeur, par période ; états consultables/exportables (PDF).
- **UX** : souple mais simple — saisie de contrat guidée (barème par tranches en quelques clics), calculs auto, pas de tableur.

À concevoir en détail (design pass dédié après la découverte). Voir aussi HOBO/exporthobo (ERP historique lié aux ventes) dans la découverte.

## Ventes : un seul lieu de naissance par exemplaire (décidé le 8 octobre 2026)
Objectif : des chiffres de vente quasi exacts pour les droits d'auteur, les écarts se limitant au service
de presse et au pilon. Chaque circuit physique produit ses lignes de vente **une seule fois**, sans ressaisie ;
la facture est la face « argent » de la même ligne, jamais une seconde saisie.

| Circuit | Source de vérité | Canal |
|---|---|---|
| Librairies via Belles Lettres | relevé de l'extranet BLDD (ventes, retours ; stock mensuel : sorties, entrées = réimpressions, inventaire) | `bldd` |
| Site, VPC, comptoir, rencontres | commandes (Stripe, saisie, import, SumUp) | `web`, `comptoir` |
| Dépositaires et salons | **carnet de vente** importé (→ relevé + facture + stock du dépôt) | `depots` |
| Clients pro facturés en direct | la facture émise (à venir) | à créer |

**Dépôts** (`/admin/depots`, module `depots.ts`) : un client pro coché « dépositaire » reçoit des exemplaires
(mouvements `reassort`), les compte (`inventaire` : l'écart devient un mouvement, refaisable à volonté), et rend
un carnet (xlsx : ISBN, titre, PPTTC, stock début, CB, chèque, espèces, SP, stock fin ; gabarit pré-rempli
téléchargeable). La validation du carnet crée en une fois le relevé sur le canal « Dépôts & salons » (SP en
exemplaires gratuits, net = prix public HT − remise), le brouillon de facture au dépositaire (PPTTC − remise,
TVA du livre) et les mouvements du dépôt ; le stock début du carnet peut servir d'inventaire (premier carnet).
Annuler un carnet retire relevé, mouvements et facture brouillon.

Réglages : remise par défaut (Paramètres › Dépôts), remplaçable sur la fiche client. Droits sur ventes directes
facturées : **au prix net facturé** (à confirmer par Thierry avant la première reddition).

Vérifié chez Belles Lettres : un réassort vers un dépôt apparaît dans la colonne « sorties » de l'état mensuel,
sans destinataire ; une réimpression dans « entrées » ; leur correction dans « inventaire ». D'où le rapprochement
à construire : stock BLDD début + entrées − sorties − ventes nettes + inventaire = stock fin, et nos sorties
vers les dépôts doivent égaler leurs « sorties ».

Reste à faire : réassort expédié par l'EDI BLDD vers le dépôt ; factures directes qui créent leurs lignes de
vente ; écran de rapprochement mensuel (écarts à qualifier : SP, pilon, perte).

## Bibliothèque ebook
- Un acheteur d'ebook doit disposer d'une **bibliothèque en ligne** pour re-télécharger ses livres achetés (entitlements liés au compte, fichiers sur R2).

## Front
- **Même contenu** que l'actuel agone.org, mais **ergonomie et design améliorables**. Reprendre l'IA (catalogue, livres, auteurs, rencontres, actualités, pages) en la modernisant.

## Questions ouvertes (à trancher — NON bloquantes pour la Phase 0)
Bloquent surtout les Phases 3-4 (BL + droits) :
1. **Format des ventes/reddition BLDD** — sous quel format Les Belles Lettres envoient-ils les ventes/retours ? (un fichier exemple débloque la Phase 4 ; le web n'est qu'une minorité du volume).
2. **Modèle de contrat** — % sur PPHT / TTC / net éditeur ? paliers par tirage ? taux différent papier/ebook/poche/rôle ? (le schéma suppose paliers en % du HT, par rôle et par périmètre — à confirmer).
3. **Répartition co-auteurs** — égalitaire par défaut ou toujours définie au contrat ?
4. **Tirages** — nécessaires au calcul ? où sont-ils (compta Agone) ? (absents de tout système actuel).
5. **Identité de paiement auteur** — un logiciel compta/fournisseurs existe-t-il, ou on ressaisit IBAN/SIRET/AGESSA dans AGONE ?
6. **Historique pré-2024** — exploiter l'ancienne base PostgreSQL (Oscar/Wagtail) ou démarrer les redditions à neuf ?
7. **Newsletter** — garder Brevo (liste 10) pour le marketing + Resend transactionnel, ou tout migrer sur Resend ?
8. **Antichambre (1022 articles)** — tout migrer + magazine actif, ou geler/archiver ? (supposé dans le périmètre).
9. **Rencontres passées** — migrer les 291 passées ou seulement récentes/à venir ?
10. **Souscription** — comptée dans les droits au prix plein ou souscription ? à la date de commande ou de parution ?
11. **Facturation** — numérotation légale (préfixe/format, reset annuel) ? (≈15 factures aujourd'hui).
12. **Séries** — modéliser les œuvres multi-volumes (OC Rosa Luxemburg) en `series` ou via `collection` ?
