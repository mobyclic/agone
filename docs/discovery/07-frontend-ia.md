# 07 — Front-end IA & Visual Identity (agone.org)

Discovery for the AGONE 2.0 rebuild. Captures the current information architecture, URL structure, brand identity, and design/ergonomics improvement opportunities. Source: live agone.org (server-rendered WordPress) + server files + MySQL (READ-ONLY).

Current stack: WordPress + **YOOtheme Pro** page builder (parent theme `yootheme`, child theme `agone` by Graphik-Factory.com) + UIkit CSS framework + WooCommerce 8+ (HPOS). Books/authors/events are **custom post types**, not Woo products — commerce is a custom cart bolted onto WooCommerce.

---

## 1. Sitemap & URL structure

### Site basics
- `blogname` = **Éditions Agone**, `blogdescription` = **"Editeur engagé"** (site tagline).
- Permalink structure: `/%postname%/`. Front page = static page "Accueil" (ID 2).
- Language: French. Single locale.

### Primary navigation (desktop menu, 6 items)
| Label | URL |
|---|---|
| Accueil | `/` |
| Antichambre | `/antichambre/` (the magazine/blog) — has dropdown |
| catalogue / Catalogue | `/livres/` — has dropdown |
| auteurs / Auteurs | `/auteurs/` |
| rencontres / Rencontres | `/rencontres/` |
| à propos | `/a-propos/` |

Note: menu labels are inconsistently cased (mix of lowercase `catalogue`/`auteurs`/`à propos` and capitalized). Some items point to relative `/rencontres`, `/livres`, `/auteurs` and some to absolute page URLs — duplication in the menu tree (24 `nav_menu_item` rows across 3 menus).

**Antichambre dropdown** = the 8 active blog categories (thematic columns):
À quoi sert l'École, Impérialismes, Inactualités, L'Ordre médiatique, Raison garder, Révolution sociale ou barbarie, Tout le reste est littérature (+ "Chroniques" categories that are empty/legacy).

**Catalogue dropdown** = the book collections (taxonomy `collection`):
Carte de l'édition française, Banc d'essais, Contre-feux, Éléments, L'Épreuve des faits, Littératures, Œuvres complètes de Rosa Luxemburg, Revue Agone.

### Content types & permalink patterns
Custom post types registered via ACF (imported from CPT-UI):

| Type | Count (published) | Single URL pattern | Archive |
|---|---|---|---|
| `livres` (books) | 386 | `/livre/{slug}` (rewrite slug `livre`, no front) | none (uses page `/livres/`) |
| `auteurs` (authors) | 983 | `/auteur/{slug}` (rewrite slug `auteur`) | none (uses page `/auteurs/`) |
| `rencontres` (events) | 284 | `/rencontres/{slug}` (post_type_key, `has_archive`) | `/rencontres/` + `/rencontres/page/2/` + RSS `?feed=rss2` |
| `post` (Antichambre articles) | 1022 | `/{slug}/` (standard) | `/antichambre/` and category archives |
| `product` (Woo) | 3 | `/product/{slug}` | `/shop/` (page ID 6, slug `shop`) |

Note: slug formats are inconsistent — some author slugs use hyphens (`pierre-caminade`) and some underscores (`pierre_caminade`), some are bare numeric IDs (`5505`). Same for collections: `l_epreuve_des_faits` (underscores) vs `banc-dessais` (hyphens). **The AGONE 2.0 slugging must be normalized.**

### Taxonomy listing URLs
- Book collection listing: `/livres/{collection-slug}/` e.g. `/livres/elements/`, `/livres/contre-feux/` — driven by the `collection` taxonomy (14 terms, 8 non-empty).
- Blog category listing: `/{category-slug}/` (e.g. `/inactualites/`).
- `/livres/` (page 573) is the catalogue hub listing the collections.

### WooCommerce / account URLs
| Function | Slug | Notes |
|---|---|---|
| Cart | **`/mon-panier/`** (page 7) | |
| Checkout | **`/checkout/`** (page 8) | redirects to `/mon-panier/` when cart empty |
| My account | **`/mon-compte/`** (page 9) | login/register + order history |
| Shop (Woo default) | `/shop/` (page 6) | essentially unused — only 3 real products |
| Product base | `/product/` | |
| Category base | `/product-category/`, tag base `/product-tag/` |

Add-to-cart on book pages is **custom**: the livre single page carries an `add_to_cart` / `add-to-cart` handler with JS reading `prixLivre` and posting `{prix, ...}` via `admin-ajax.php` (not a standard Woo product form). Commerce mechanics are covered by the commerce discovery agent — flagged here as an IA dependency.

### Other real pages (page CPT, 20 published)
- `/a-propos/` — "à propos" / la maison (mission + contact + submissions).
- `/contact/` (page 157).
- `/mentions-legales/` — Mentions légales.
- `/engagements/` — **Conditions générales de vente** (CGV) (title "Conditions générales de vente", slug `engagements`).
- `/ma-bibliotheque/` — "ma bibliothèque" (user's digital library / epub downloads, ID 717).
- `/recherche/` — search page (743).
- `/a-paraitre/` — à paraître (forthcoming, 643), `/focus/` (645).
- Legacy/admin: `test`, `homepage2`, `adminagone`, `gestion` (internal back-office pages — do NOT carry over).

### Footer
- Social: **Mastodon, Facebook, Instagram** (no Twitter/X).
- Menu: Antichambre, Catalogue, Auteurs, Rencontres, À propos, Contact.
- Legal: Mentions légales, Conditions Générales de vente.
- Newsletter signup (Brevo/Sendinblue — `sib_push_*` meta present on posts; Mailjet plugin also installed).
- Persistent shipping banner (since 2025-07-01): online sales restricted to metropolitan France after La Poste dropped the "Livres & Brochures" tariff.

---

## 2. Page inventory (what each template shows)

### Home (`/`)
Stacked full-width sections (YOOtheme builder), several on **black backgrounds** with white book cards:
1. Shipping notice banner.
2. Hero / "à la une" — ~6 recent titles (cover, author, subtitle).
3. **Antichambre** teaser — 4 recent articles (date, category tag, excerpt).
4. **FOCUS** — 4 highlighted books (thumbnail covers) — driven by the `focus` book meta flag.
5. **à paraître** (forthcoming).
6. **Rencontres à venir** — 4 upcoming events (place in red, date, time, title).
7. Footer + newsletter.

### Book — single (`/livre/{slug}`)
Fields displayed (labels verbatim), backed by ACF meta:
- **Title**, **sous-titre** (subtitle/hook), **titre_originale** (original title for translations).
- **Author** — linked to `/auteur/…` (meta `livre_auteurs`; also `livre_traducteurs`, `livre_auteurs_preface`, `livre_auteurs_postface`, `livre_auteurs_divers`).
- **Collection** — linked to `/livres/{collection}/`.
- **Date de parution** (`date_de_publication`, also `date_de_publication_originale`).
- **Format** (`format_papier`, e.g. "11 x 18 cm"), **Pages** (`nombre_de_pages`).
- **ISBN** (`isbn_papier`, `isbn_digital`), **Langue originale** (`langue_originale`).
- **Prix papier** (`prix_papier`, e.g. "11€"), **Prix digital** (`prix_digital`), **fichier_epub**, **tarif_souscription** + **date_souscription** (pre-order/subscription pricing).
- **qte_stock** (stock qty), cover image (+ `cover_largeur`/`cover_hauteur`), edition note ("Troisième édition revue et actualisée"), long multi-paragraph description, editorial quote.
- **infos_additionnelles**.
- Related blocks: Antichambre (`articles_associes`), Rencontres (`rencontres_associes`), and up to 3 related books in same collection (`livres_associes`).
- Breadcrumb present.

### Author — single (`/auteur/{slug}`)
- Author name displayed large, first/last name on separate lines (Oswald condensed).
- Sections: **Préface(s)** (books they prefaced), their authored books (cover + title, linked), related Antichambre.
- **Biography and portrait are largely absent** — the current author page is thin (a clear improvement target). Author list (`/auteurs/`) is JS-rendered with an alphabetical **letter** index (`class="linkauthor"`, letter nav) fed by `admin-ajax`.

### Catalogue (`/livres/` and `/livres/{collection}/`)
- `/livres/` = hub listing the 8 collections.
- Collection page: collection description at top (e.g. Éléments: "Collection de livres de poche créée et dirigée depuis 2004 par Thierry Discepolo…"), a **sort dropdown** (recency / A→Z / Z→A), breadcrumb, then the book grid (covers, titles, authors, price). **No faceted filters** (no filter by author/theme/price/format/availability).

### Rencontres (`/rencontres/`)
- **Client-side rendered** via inline JS template + `admin-ajax` + moment.js (fr locale) — content is invisible to non-JS crawlers (SEO/accessibility issue).
- Event tile fields: **lieu** (place, styled red `#d4211c`, e.g. "Marcellaz (74250)"), **dates** (`event-tile__dates`), title, and associated books/authors.
- Backing meta: `lieu`, `date_de_debut`, `date_de_fin`, `date_et_heure`, `livres_associes`, `auteurs_associes`.
- Pagination `/rencontres/page/2/`. No visible upcoming/past filter or map.

### À propos (`/a-propos/`)
Mission statement ("politique de la lenteur", refuses marketing-driven publishing, "proposer des livres qui fournissent au plus grand nombre le plus d'outils pour comprendre le monde"), against mainstream commercial publishing. Contact: **La combinerie, 28 bd national, 13001 Marseille / editions@agone.org**. Manuscript-submission policy (email preferred, 1-month window, silence = refusal). Distribution: **Les Belles Lettres** + **Hobo Diffusion**. No team roster or history timeline.

---

## 3. Brand identity

### Logo
Wordmark SVGs (lowercase "agone" / "éditions agone" set in a custom hand-drawn/irregular typeface — the letters are vector paths, not live text). Files under uploads:
- `/wp-content/uploads/2023/10/logo_editions_agone.svg` — 277.761 × 57.012, full "éditions agone" wordmark.
- `/wp-content/uploads/2023/09/logo.svg` — 388 × 58 (wide wordmark).
- `/wp-content/uploads/2023/09/logo_agone_top.svg` — header variant.
- `/wp-content/uploads/2023/11/logo-mobile.svg` and `logo_mobile.svg` — compact mobile marks (~1.3 KB). Home references `/wp-content/uploads/2023/11/logo_mobile.svg`.

All are monochrome path-based wordmarks (recolored via CSS to black/white/red). For AGONE 2.0, obtain a clean vector master; current set is duplicated/inconsistently named.

### Colour palette (hex extracted from `webu.css` / `style.css`, by frequency)
| Role | Hex | Notes |
|---|---|---|
| **Brand red (primary accent)** | `#d4211c` | headings accents, event place, links |
| Red — light/hover | `#dd4d49` | |
| Red — dark/active | `#aa1a16` | |
| **Ink / near-black** | `#000000`, `#313131`, `#32373c`, `#464646` | section backgrounds are pure black |
| **Deep blue (secondary)** | `#26425b` | used sparingly |
| White | `#ffffff` | card text on dark sections |
| Mid grey (body text) | `#666666` | |
| Light greys / borders | `#efefef`, `#e0e0e0`, `#ddd`, `#eee` | |

Signature look: **high-contrast red-on-black / black-on-white** — militant, editorial, austere.

### Typography
Two typefaces only (self-hosted woff2 in `wp-content/themes/yootheme/fonts/`):
- **Oswald** — primary + secondary (body & headings), condensed grotesque. Body weight **300 (light)**, headings 400. Used for nearly everything including running text (`--body-font-family-primary`).
- **League Spartan** — "extra" family (`--body-font-family-extra` / `--font-family-extra`), geometric — used for display/accent.
- Fallback stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, …, sans-serif`. No serif anywhere.

Fluid type scale via CSS vars (`--font-size-extra-small` 0.75→0.875rem … `--font-size-geant` 1.875→2rem) with two breakpoints (<1199 / ≥1200). Book-card and heading sizes tokenized (`--book-card-title-font-size`, `--book-card-author-font-size`, `--release-date-font-size`, `--to-all-items-font-size`).

**Design note:** using condensed Oswald 300 for long-form body text hurts readability. AGONE 2.0 should pair a readable text face (likely a serif or humanist sans for body) with Oswald/League Spartan kept for display — this fits a literary/political publisher.

### Tone
Politically engaged (radical-left), intellectually serious, anti-commercial ("politique de la lenteur"). Austere, high-contrast, typographic. Content-first, minimal ornament.

---

## 4. Ergonomics & design improvement opportunities for AGONE 2.0

**Information architecture**
1. Normalize slugs across livres/auteurs/collections (mixed hyphens/underscores/numeric IDs today). Define canonical patterns: `/livres/{slug}`, `/auteurs/{slug}`, `/rencontres/{slug}`, `/catalogue`, `/collections/{slug}`.
2. Clean the nav: consistent casing, single source per item (remove relative/absolute duplicates), and decide catalogue-by-collection vs catalogue-by-theme.
3. Drop legacy/back-office pages (`test`, `homepage2`, `adminagone`, `gestion`, unused `/shop/`).

**Catalogue / discovery**
4. Add **faceted filtering** on the catalogue (by collection, author, theme, format papier/numérique, price, availability, année) — currently only a sort dropdown exists.
5. Unified **search** across books + authors + articles + events (current `/recherche/` is basic).
6. Availability/stock and pre-order (`souscription`) states should be first-class UI, not buried.

**Author pages**
7. Enrich author pages with **portrait + biography + full bibliography** (currently thin/empty). High-value given 983 authors.

**Events (rencontres)**
8. Server-render events (currently JS-only via admin-ajax → invisible to crawlers, poor accessibility/SEO). Add **upcoming vs past** toggle, calendar/agenda + optional map, ICS export, and cross-links to the featured book/author.

**Commerce & account**
9. Replace the custom admin-ajax add-to-cart with a robust, accessible cart flow; keep FR slugs `/panier`, `/commande`, `/mon-compte`. Surface the metropolitan-France shipping restriction contextually at cart/checkout rather than a permanent global banner.
10. `/ma-bibliotheque` (epub downloads) deserves a clean account-area design.

**Visual / accessibility**
11. Choose a **readable body typeface** (Oswald 300 is condensed/light — poor for long text); reserve Oswald/League Spartan for display.
12. Verify contrast on `#666` grey text and red-on-black; ensure WCAG AA.
13. Provide a proper vector logo master; unify the 5 duplicate logo files.
14. Keep the strong red/black editorial identity but modernize spacing, responsive book-cover grids, and card components; add dark-mode-aware theming if desired.
15. Improve mobile nav (two dropdown-heavy menus — Antichambre categories + Catalogue collections — need a mobile-friendly pattern).

---

## Open questions for the architect
- Commerce model: books are CPT `livres` with custom cart (only 3 real Woo products). Confirm whether AGONE 2.0 sells via a real product model (SurrealDB) with proper stock/pricing, and how `prix_papier` / `prix_digital` / `tarif_souscription` / epub entitlement map. (Owned by commerce agent — this is the IA dependency.)
- "Antichambre" (1022 articles, a full magazine) — is it in scope for the rebuild or archived/frozen? It's a large, distinct content pillar.
- Digital library `/ma-bibliotheque` (epub downloads gated by account/purchase) — carry over as-is?
- Author bios/portraits are mostly missing today — is enriching them part of the content migration or a later editorial task?
- Newsletter provider: both Brevo (`sib_push_*`) and Mailjet plugin present — which is authoritative for AGONE 2.0 (spec says Resend)?
