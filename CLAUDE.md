# AGONE 2.0 — Guide développeur & conventions

Refonte complète du site des **Éditions Agone** (agone.org) — éditeur engagé, Marseille.
Objectif : reprendre la vente en ligne (catalogue, boutique, ebooks) avec une meilleure
ergonomie, **et** ajouter un back-office de gestion des **droits d'auteur** (redevances).

Le site remplace un WordPress/WooCommerce (CPT `livres`/`auteurs`/`rencontres`, distributeur
Les Belles Lettres). Voir `docs/` : `DISCOVERY-SUMMARY.md` (l'existant), `ARCHITECTURE.md`
(la cible), `DECISIONS.md` (décisions produit), `docs/discovery/*` (rapports détaillés).

## Stack
- **SvelteKit 2 + Svelte 5 (runes)**, `adapter-node`, déploiement Railway. Package manager : **bun**.
- **SurrealDB v2/3** (cloud), accès **HTTP** via `src/lib/server/surreal.ts` (connexion en root).
- **Tailwind v4 + shadcn-svelte** (bits-ui, phosphor-svelte, svelte-sonner).
- **Cloudflare R2** (couvertures publiques + ebooks privés), **Resend** (mails), **Stripe** (paiement), **Leaflet** (carte des rencontres).
- **Monolingue français** — PAS d'i18n (pas de `$lib/i18n`, pas de champs `*_i18n`) ; contenu éditorial en texte simple.

## Commandes
```
bun run dev        # dev (vite) — se rabat sur 5174 si 5173 occupé
bun run check      # svelte-check (DOIT rester à 0 erreur)
bun run schema     # applique src/lib/server/schema.surql au cloud (idempotent)
bun run seed       # compte admin + collections de référence
bun run build
```
Admin de dev (seed) : `alistair.marca@gmail.com` / `agone2026` (rôle `admin`).

## Rôles & accès — `src/lib/roles.ts` + `src/lib/server/access.ts`
- `user.role` : `admin` (back-office complet) · `editor` (éditorial) · `customer` (client) · `pending` (email non vérifié).
- Gardes (dans load/actions) : `requireUser` · `requireStaff` (admin|editor) · `requireAdmin`.
- `locals.user` : `{ id, email, first_name, last_name, full_name, slug, avatar_url, role, email_verified }`. Session cookie **`ag_session`**.

## Arborescence & espaces (cible)
- **Public** : `src/routes/<module>/…` (catalogue, livre/[slug], auteurs, rencontres, antichambre, panier, checkout, pages…).
- **Espace client** : `src/routes/compte/…` (garde `requireUser`) — bibliothèque ebooks, commandes, profil.
- **Back-office** : `src/routes/admin/…` (garde `requireStaff`, shell `DashboardShell`) — catalogue, auteurs, commandes, stock, expéditions BL, droits d'auteur (`requireAdmin`), contenu, paramètres.
- **Logique serveur** : un module par fichier `src/lib/server/<module>.ts`.
- **Composants** : `src/lib/components/<Xxx>.svelte`. UI shadcn dans `ui/`.

## SurrealDB — `src/lib/server/surreal.ts`
```ts
import { query, recId } from '$lib/server/surreal';
import { RecordId } from 'surrealdb';
// query<T>() renvoie TOUJOURS un tableau "plain" (RecordId → "table:id", datetime → ISO).
const rows = await query<any>(`SELECT * FROM book WHERE status = $s LIMIT 20`, { s: 'published' });
await query(`UPDATE $id SET title = $t`, { id: recId('book', bookId), t: 'X' });
// Graphe (contributions typées par rôle — base des droits d'auteur) :
await query(`RELATE $b->contributed_by->$a SET role='translator', share=100`, { b: recId('book', bId), a: recId('author', aId) });
```
Notes : `FROM ONLY` renvoie un objet (ne pas déstructurer `const [x]=`). `time::now()` pour l'horodatage ; `updated_at` s'auto-met à jour. `FLEXIBLE` se met APRÈS `TYPE`. FTS : `WHERE title @@ $q` (index BM25 `ft_book_title`, `ft_author_name`).

## Modèle de données — `src/lib/server/schema.surql`
Cœur auth (`media`, `user`, `session`, `magic_link`, `email_otp`, `password_reset`, `site_setting`).
Catalogue & contenu (Phase 1, **migrés depuis WordPress**) : `collection`, `rubrique`, `book`,
`author` + arête `book->contributed_by->author {role, share, position}` ; `venue` (lieux
**réutilisables & géolocalisés**, `geometry<point>`), `event` (→ venue), `article` (Antichambre),
`page`. **L'ISBN-13 (`book.isbn_paper`) est la colonne vertébrale.** Chaque nœud migré porte `legacy_wp_id`.
À venir : `order`/`contains`, `ebook_asset`/`owns`, `stock_movement`, `bl_export`,
`royalty_contract`/`sales_report`/`royalty_statement`.

Modules serveur Phase 1 : `catalogue.ts`, `authors.ts`, `events.ts`, `articles.ts`, `pages.ts`
(+ `$lib/labels.ts` client-safe). Migration : `scripts/migrate-catalogue.ts`, `migrate-covers.ts`,
`migrate-rencontres.ts`, `migrate-content.ts` (dumps JSON depuis MySQL prod → Surreal, clés `legacy_wp_id`).
Pages publiques : `/`, `/catalogue`, `/livre/[slug]`, `/auteurs`, `/auteur/[slug]`, `/collections/[slug]`,
`/rencontres` (+`[slug]` carte Leaflet), `/antichambre` (+`/article/[slug]`), `/recherche`, `/a-paraitre`,
pages statiques via `/[slug]` (a-propos, cgv, mentions-legales…) + `/contact`.
Volumes migrés : 432 livres, 986 auteurs, 14 collections, 342 couvertures (R2), 289 rencontres /
205 lieux, 1022 articles, 6 pages.

## Intégration Belles Lettres (distributeur) — Phase 3
Deux jobs à porter depuis le PHP : **import stock** (scrape extranet BLDD → `book.stock_qty`) et **export commandes** (fichier EDI largeur fixe A/B/C → FTP, 2×/jour).
**SÉCURITÉ : l'envoi FTP reste DÉSACTIVÉ (`BL_FTP_ENABLED=false`) tant que le site n'est pas en production** — dry-run vers un dossier local uniquement. La récupération de stock est autorisée.

## Migration
Serveur WordPress de prod = **LECTURE SEULE** (SSH/MySQL, pour migrer uniquement). Détails et clés dans `docs/` + mémoire projet. Scripts ETL idempotents à venir sous `scripts/migrate-*.ts`, clés par `legacy_wp_id`.

## Règle d'or
`bun run check` doit rester à **0 erreur**. Réutiliser l'existant (composants shadcn, helpers serveur), style sobre & éditorial (rouge de marque `#d4211c`, noir, accent bleu `#26425b`), tout passe par le graphe Surreal.
