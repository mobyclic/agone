# AGONE 1.x — Discovery Summary (executive digest)

Consolidated from the nine discovery reports in `docs/discovery/`. This is the "what
exists today" digest that feeds `ARCHITECTURE.md` (the AGONE 2.0 proposal).

Current system: **WordPress + YOOtheme Pro (child theme `agone`) + UIkit + WooCommerce
10.8.1**, MySQL DB `[REDACTED-DB]`, prefix `wri_`. Distribution by **Les Belles Lettres
(BLDD)**. Site `agone.org` = *Éditions Agone*, "Éditeur engagé" — radical-left political /
literary publisher, Marseille.

---

## 1. The one thing to understand: books are NOT WooCommerce products

The catalogue is the **`livres` custom post type**, not WooCommerce. There are only **3
generic WC products**, all priced 0, used as containers:

| WC product | ID | Role | maps to `format` |
|---|---|---|---|
| `livre` | **24** | printed book | `papier` |
| `epub` | **664** | ebook (downloadable) | `epub` |
| `livre (Souscription)` | **4084** | pre-order / crowdfunding | `souscription` |

At add-to-cart the theme injects the real book's identity + price via GET params
(`id_livre`, `livre_prix`, `livre_type`), overrides the 0 price with `set_price()`, and
writes `_id_livre` + `format` onto each order line item. **No WC SKU, no WC stock, no
per-book product.** Stock lives on the book (`qte_stock`). This whole hack is replaced in
2.0 by first-class Book records with paper/ebook/souscription variants.

"Souscription" = **pre-order of a forthcoming title** (price from `tarif_souscription`),
NOT recurring billing. The 2 `wc-subscription` orders are orphans (no Subscriptions plugin
installed). No recurring-subscription engine is needed.

---

## 2. Data volumes

| Entity | Store | Count | Notes |
|---|---|---|---|
| Books | `livres` CPT | **386 pub / 46 draft** | draft ≈ à paraître |
| Authors/contributors | `auteurs` CPT | **983 pub** (992 w/ meta) | minimal record, **no photo**, bio = `post_content` |
| Events | `rencontres` CPT | **284 pub** | ~15 upcoming, ~291 past |
| Blog articles (Antichambre) | `post` | **1022 pub** | 7 active rubriques |
| Static pages | `page` | 20 pub | ~6 real front pages |
| Orders | `wri_posts` (`shop_order`) | **2398 completed** (+27 pending, 17 failed, 7 cancelled, 3 refunded, 2 processing) | **HPOS empty** — legacy store authoritative; range **2024-05 → present** only |
| Order line items | `wri_woocommerce_order_items` | 3073 line_item + 2109 shipping | qty always 1 |
| Ebook entitlements | `agone_mabibliotheque` | **253 rows** | custom table; the truth for "who owns which ebook" |
| Physical .epub files | `wp-content/uploads/YYYY/MM/` | **191 files, ~878 MB** | EPUB only; 402 `fichier_epub` meta rows (reconcile gap) |
| Legacy ISBN-named covers | `migration.agone.org/couvertures/` | 347 files (+4 zips, ~560 MB) | named `<EAN13>.png|jpg` — R2 migration source |
| Collections | taxonomy `collection` | 14 terms (8 non-empty) | Contre-feux 80, L'Épreuve des faits 76, Éléments 61… |
| Rubriques/thèmes | taxonomy `category` | 13 terms | **shared** between books and blog |
| Newsletter subscribers | Brevo cloud (list **10**) | 0 local rows | not in DB |
| WC products | `product` | 3 | the generic containers above |
| PDF invoices | `wcpdf` | ~15 total | feature barely used |

Format distribution across all order line items: **`papier` 2457, `souscription` 353,
`epub` 256**, plus typos `papioer` (1) and `livre` (1) to clean on migration.

Per-title sales top rows (web shop only): `id_livre` 6181→382 units, 3566→360, 7715→220.

---

## 3. Key IDs & codes that thread everything together

| Code | What it is | Where used |
|---|---|---|
| **ISBN-13 / EAN-13 `isbn_papier`** | Paper book primary key | THE join key: catalogue ↔ BLDD stock ↔ BLDD EDI orders ↔ covers ↔ royalties. GENCOD == paper ISBN (no separate BL code). |
| **`isbn_digital`** | Ebook ISBN-13 | Ebook identity; proposed R2 filename key |
| **Agone GLN `3052325760012`** | Agone supplier EAN in all BL EDI | A-record header, twice per order |
| **`_id_livre`** | `livres` post ID on every order line | Links a sale to its book (the only book reference on orders) |
| **`format`** | `papier` \| `epub` \| `souscription` | On each order line; drives WC container product + BL inclusion |
| Publisher ISBN prefix | **978-2-7489-** | All Agone ISBNs |
| Poster EAN **`9782748906035`** | Special "poster/affiche" article | Triggers `AGOLETLTR` letter-mail shipping code in BL EDI |
| BL colisage codes | `AGOCOLCOL` (FR parcel), `AGOLETLTR` (FR poster/letter), `AGOBROBRO` (foreign) | B-record of EDI file |
| Country code | FR → **`100`**, else 2-letter ISO padded to 3 | A-record of EDI file |
| WC generic products | 24 / 664 / 4084 | paper / ebook / souscription flags on lines |

---

## 4. Belles Lettres (BLDD) integration — the operational core

Two independent cron jobs in `belleslettres/`:

- **Stock IN — `majstockbl.php`**: authenticated **HTML scrape** of the BLDD ASP extranet
  (`www.bldd.fr`, login `agone`/`[REDACTED-PWD]`) — `GET stocks.asp?…&com=excel` returns HTML,
  DOM-parsed (cols 0=auteur, 1=titre, 3=EAN, 18=stock). Matches by EAN → overwrites ACF
  `qte_stock` (absolute, not delta). Emails an HTML diff report via **Brevo**. Only pulls
  the *current month*.
- **Orders OUT — `sendcomtobl.php`**: builds a fixed-width **EDI** text file (CRLF,
  ASCII//TRANSLIT), record groups **A** (225b header+ship-to) / **B** (204b shipping code +
  contact) / **C** (20b per book: EAN13 zero-pad-left + qty6). Filename
  `CDAGO{YmdHis}.txt`. Selects `wc-processing` orders + a `wc-subscription` pass
  (souscription lines released only when ACF `date_souscription` == today). Uploads via
  plain FTP (`[REDACTED-FTP-HOST]`, `[REDACTED-FTP-USER]`), then archives `tosend/`→`sent/` and flips order
  status. **De-dup is via status transitions applied ONLY after successful FTP** — if FTP
  fails, nothing flips (safe re-send). `sent/` = 749 files, Apr-2024 → Jul-2026, ~08:30 &
  ~20:30 daily.

**Critical caveat:** bookshop/wholesale sales — the bulk of royalty-bearing volume — flow
through BLDD and are **not in this DB**. The web shop is only direct sales since 2024-05.

---

## 5. Ebooks & library

Ebook = a **format of a `livres` post** (sellable iff `prix_digital` AND `fichier_epub`
set). Sold through generic product 664. WC's native downloadable machinery is unused
(permissions + download-log tables empty). Entitlement lives in **`agone_mabibliotheque`**
(`id_user, id_livre, id_order, date_add`, 253 rows, unique on user+book), populated on
`woocommerce_payment_complete`.

**Security: the download path is broken** — `download.php` checks login only (no ownership
check → any user can grab any ebook), is path-traversal-prone, and the .epub files are
publicly web-served anyway (`uploads/.htaccess` blocks only PHP). No R2, no watermark/DRM.
Guest checkouts land as `id_user=0` (unrecoverable library). All of this is redesigned in
2.0: private R2 + ownership-gated signed URLs + forced accounts.

---

## 6. Authors & royalties (droits d'auteur)

Author record is **minimal**: full name, `nom`/`prenom`, bio HTML, `hide_on_list`. **No
photo, no fiscal/bank identity, no nationality/dates.**

Book↔author link is **role-typed by which of 5 bidirectional ACF fields** connects them —
`livre_auteurs` (principal), `livre_traducteurs`, `livre_auteurs_preface`,
`livre_auteurs_postface`, `livre_auteurs_divers` — stored as serialized ID arrays on both
sides. **No % share, no co-author ordering, no per-book contract.**

**Zero royalty/contract data exists anywhere** (grep for droit/contrat/redevance/à-valoir/
avance/tirage/reddition = nothing). Entirely missing and must be built or sourced:
contract %s, advances (à-valoir), co-author splits, print runs (tirages), BLDD distribution
sales, pre-2024 sales history (old PostgreSQL Oscar DB), reddition-de-comptes history,
author payment/fiscal identity, returns/SP accounting.

---

## 7. Catalogue record (the `livres` fields worth migrating)

Bibliographic (ACF group 100): `sous_titre`, `titre_originale`, `langue_originale`,
`date_de_publication` (`Ymd`), `date_de_publication_originale`, `nombre_de_pages`,
`cover_largeur`/`cover_hauteur` (physical cm — replaces any broché/poche enum). Commerce:
`prix_papier`, `prix_digital`, `tarif_souscription`, `date_souscription`, `isbn_papier`,
`isbn_digital`, `qte_stock`, `focus` (highlight bool), `fichier_epub`. Description =
`post_content` (HTML). Cover = WP featured image (`_thumbnail_id`, 426/431 books, editorial
filenames — not ISBN-named). Taxonomies: `collection` (+ Yoast primary), `category`.

Old PostgreSQL Oscar/Wagtail DB (`[REDACTED-DB]`, served at admin.agone.org) is the
authoritative pre-WP source (dual ISBN-10/EAN-13, original title/language/date). Catalogue
migration into WP is essentially **done** (432 livres, 992 auteurs with ACF meta). Covers
in `couvertures/` are keyed by EAN-13 → trivial R2 migration.

---

## 8. Content, brand, integrations

- **Events** (`rencontres`): description = `post_content`; `date_de_debut`/`date_de_fin`
  (`Y-m-d H:i:s`); `lieu` = google_map blob (name/address/city/postcode/state/lat/lng/
  placeId); `auteurs_associes` + `livres_associes`. Currently JS-rendered (SEO/a11y
  problem) — must be server-rendered in 2.0.
- **Articles** (`post` / Antichambre): 7 rubriques (Inactualités 413, L'Ordre médiatique
  144, Tout le reste est littérature 139, Révolution sociale ou barbarie 137, Raison garder
  97, À quoi sert l'École 89, Impérialismes 3). Many titled `[LettrInfo NN]` = archived
  newsletter issues.
- **Static pages** to rebuild: à propos, contact, CGV (slug `engagements`), mentions
  légales, à paraître, focus.
- **Nav**: Antichambre ▾ (7 rubriques) · Catalogue (`/livres`) · Auteurs · Rencontres · À
  propos · Search · Compte · Panier. FR commerce slugs: `/mon-panier`, `/checkout`,
  `/mon-compte`, `/ma-bibliotheque`.
- **Brand**: brand red `#d4211c` (light `#dd4d49`, dark `#aa1a16`), pure black sections,
  secondary blue `#26425b`, greys. Fonts Oswald (condensed) + League Spartan; no serif —
  2.0 should add a readable body face. Slugs are inconsistent (hyphens/underscores/numeric)
  and need normalizing. Wordmark SVGs under `uploads/2023/…` (5 duplicates to consolidate).
- **Payment**: Stripe live via `woo-stripe-payment` (gateway `stripe_cc`), immediate
  capture, no saved cards, no 3DS forced. Per-order Stripe refs (`pi_`, `ch_`, `pm_`, fee,
  net, mode). **Live secret keys stored plaintext in DB — must rotate.**
- **Tax/shipping/coupons**: no tax rates configured (0), free shipping France only (metro-FR
  restriction since 2025-07 after La Poste dropped the Livres & Brochures tariff), no
  coupons.
- **Newsletter**: Brevo (list 10), email+name form; Mailjet plugin dormant. Subscribers
  only in Brevo cloud.

---

## 9. Secrets to rotate on cutover (do NOT port)

BLDD extranet `agone`/`[REDACTED-PWD]`; BL FTP `[REDACTED-FTP-HOST]` `[REDACTED-FTP-USER]`/`[REDACTED-PWD]`; Brevo API
key `xkeysib-…`; Stripe live secret keys (in `woocommerce_stripe_api_settings`); old
PostgreSQL + WP + migration DB creds in `migration.agone.org/config.php`. All were committed
in plaintext under public web roots.
