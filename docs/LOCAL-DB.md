# Base SurrealDB locale (travail hors connexion)

Une copie complète de la base cloud tourne sur la machine, avec les couvertures.

## Au quotidien

```
bun run db:local     # démarre SurrealDB local (port 8123) — à laisser tourner
bun run dev          # le site utilise automatiquement la base locale
```

Après un redémarrage de la machine, relancer `bun run db:local` avant `bun run dev`.

## L'interrupteur : `.env.local`

Tant que `.env.local` existe, **tout** vise la base locale : le site (`bun run dev`)
comme les scripts (`bun run schema`, `seed`, migrations). Il n'est jamais commité.

- Revenir au cloud : renommer `.env.local` → `.env.local.off`, relancer `bun run dev`.
- Revenir au local : le renommer à l'inverse.

## ⚠ Ce qui ne remonte PAS vers le cloud

Il n'y a **aucune synchronisation local → cloud**. Tout ce qui est modifié dans la
base locale (fiches, articles, commandes de test, réglages) y reste. Les changements
de **code**, eux, passent normalement par git. Les changements de **schéma** faits
en local devront être rejoués sur le cloud au retour (`bun run schema` sans `.env.local`).

## Rafraîchir la copie depuis le cloud (réseau requis)

```
bun run db:local:pull    # ÉCRASE la base locale par un export frais du cloud
```

Rapatrie aussi les nouveaux médias. Ce qui avait été saisi en local est perdu.

## Ce qui ne marche pas hors connexion

Fonds de carte (IGN / OSM), envoi d'e-mails (Resend), paiement (Stripe),
synchronisation WordPress, géocodage des adresses, téléversement de nouvelles
images (R2), intégrations Instagram. Le reste du site fonctionne.

## Détails techniques

- Binaire : `~/.local/bin/surreal-3.2.4` — même version que le cloud (un export
  3.2 réimporté en 3.0 peut échouer). Le `surreal` global (3.0.5) n'est pas touché.
- Données : `~/.local/share/agone-surreal/data` (SurrealKV), exports dans `dumps/`.
- Médias : `static/_r2-local/` (ignoré par git) ; en base LOCALE, `media.url`
  pointe sur `/_r2-local/…` (réécrit par `scripts/mirror-media.ts`, qui refuse de
  tourner hors base locale).
