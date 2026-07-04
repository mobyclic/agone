# Discovery 08 — migration.agone.org app & HOBO connection

Server path: `~/www/migration.agone.org/public_html`
Investigated read-only over SSH/MySQL on 2026-07-04. All timestamps on files are 2024–2025 (last real activity Mar 2025).

## TL;DR

`migration.agone.org` is **not a live production service**. It is a one-off, hand-run **ETL / migration toolkit** (PHP + jQuery/UIkit front controller) that Alistair used to move Agone's *previous* website (a Django **Oscar** e-commerce + **Wagtail** CMS stack on a PostgreSQL DB) into the *current* WordPress/WooCommerce site (`wri_` MySQL DB). It is triggered manually by clicking a button in `index.php`, which fires one AJAX action at a time. Most write-paths are commented out — it survives mainly as **documentation of the old data model and mappings**.

Two things here matter for AGONE 2.0:
1. **`exporthobo.php`** — builds the **HOBO** bibliographic-metadata spreadsheet (`HOBO_Fonds_Agone.xlsx`) from the old catalogue. This is the cleanest single description of Agone's book-metadata schema and the ISBN↔title↔author-roles↔price mapping — directly reusable for the catalogue and the future droits-d'auteur module.
2. **`couvertures/`** — cover images named by **EAN-13 ISBN**, ready to bulk-migrate to R2.

## Stack / dependencies

`composer.json`: `ezsql/ezsql ^5.1` (multi-DB abstraction, both pgsql + mysqli), `phpoffice/phpspreadsheet ^1.29` (xlsx read/write), `biblys/isbn ~3.0` (ISBN-10 → EAN-13 conversion). Front-end: UIkit 3.16 + jQuery 3.6 from CDN. `index.php` exposes buttons calling `ajax_new.php`, `maj_agone.php`, `exporthobo.php`, `maj_users.php`, `bellelettre.php`.

## Data sources (config.php — three databases)

`config.php` holds creds for **three** databases:

| Role | Engine | DB | User | Password | What it is |
|---|---|---|---|---|---|
| `db_old` | **PostgreSQL** | `[REDACTED-DB]` | `[REDACTED-DB-USER]` | `[REDACTED-PWD]` | **Previous Agone site** — Django **Oscar** catalogue + **Wagtail** CMS + custom author tables. Was served at `admin.agone.org`. Source of truth for the legacy backlist. |
| `db_new` | MySQL | `[REDACTED-DB]` | `[REDACTED-DB-USER]` | `[REDACTED-PWD]` | **Current WordPress** (`wri_` prefix). Migration *target*. Same DB this discovery project queries. |
| `db_migration` | MySQL | `[REDACTED-DB]` | `[REDACTED-DB-USER]` | `[REDACTED-PWD]` | Scratch DB with a `clients` table mapping `old_id` → new customer id (used by `maj_users.php` for customer dedup). |

The scripts also `require('.../wp-load.php')` to call WP functions (`wp_insert_post`, `update_post_meta`, `wp_set_post_terms`, `set_post_thumbnail`). Note stale absolute paths: `maj_agone.php`/`maj_users.php` point at an old sandbox `/home/customer/www/alistairm35.sg-host.com/...`; `ajax_new.php` correctly points at `/home/customer/www/agone.org/...`.

## Old (PostgreSQL / Oscar) data model — reconstructed from the code

The migration code is the best surviving map of the legacy schema. Key tables and the **attribute-id mapping** (documented in `exporthobo.php` comments and used throughout):

**Products / catalogue (Oscar):**
- `catalogue_product` — books. `structure='parent'` = the work; child rows = purchasable variants (formats). Fields used: `id`, `title`, `slug`, `upc`, `parent_id`, `status`, `date_created`, `date_updated`.
- `catalogue_productattributevalue` — EAV attribute values per product: `product_id`, `attribute_id`, `value_text|value_integer|value_float|value_richtext|value_datetime|value_option_id|value_protected_file`.
- **`catalogue_productattribute` id map:**
  - `1` = **Format** (option ids: **1 = papier, 2 = PDF, 3 = epub**)
  - `2` = Sous-titre
  - `3` = **ISBN**
  - `4` = Titre original
  - `5` = Langue originale
  - `6` = Date de parution originale (datetime)
  - `7` = Date de parution (datetime)
  - `8` = Présentation / **Argumentaire** (richtext)
  - `11` = Dimensions (text `LxH`, split on `x/X/*/×`)
  - `12` = Nb de pages (integer)
  - `14` = fichier ebook protégé (`value_protected_file`)
- `catalogue_category` — **collections** (`id`, `name`, `slug`). Agone collections and their new WP term ids are hard-mapped in `maj_agone.php` (see below).
- `catalogue_productcategory` — book→collection join.
- `catalogue_productimage` (`original_id` → `wagtailimages_image`) — cover images (Wagtail). `wagtailimages_image.file` path; migration strips `original_images/` and rewrites to `<name>.original.<ext>`, fetched from `https://admin.agone.org/media/images/...`.
- `partner_stockrecord` — pricing & stock per variant: `partner_sku` (SKU/ISBN), `price_excl_tax` (**HT**), `num_in_stock`.

**Authors (custom `products_author*` tables) — the role model that matters for royalties:**
- `products_author` — `id`, `firstname`, `lastname`, `slug`, `display_on_author_list`, `biography` (JSON), `teaser`.
- `products_author_products` — **main authors** (book↔author).
- `products_author_products_foreword` — **préface**.
- `products_author_products_afterword` — **postface**.
- `products_author_products_translation` — **traduction**.
- `products_author_products_others` — **autres contributeurs**.

**Blog / CMS (Wagtail):** `blog_article`, `blog_article_authors`, `blog_article_categories`, `blog_category` (content is Wagtail StreamField JSON; migration decodes `content[0]['value']`). `products_pressarticle`, `products_additionalcontent` also exist. Customers: `agone_user` (`id`, `first_name`, `last_name`, `email`).

**Collection → new WP term-id map** (from `maj_agone.php`): litteratures→28, lordre-des-choses→29, elements→27, rosa-luxemburg→32, memoires-sociales→30, contre-feux→26, revue-agone→31, banc-dessais→25, cent-mille-signes→39, manufacture-de-proses→40, epreuves-sociales→41, dossiers-noirs→42.

## What the scripts do

- **`maj_agone.php`** — the main catalogue importer old→WP. Reads authors, collections, and every `parent` product; resolves the paper variant (Format option 1) and epub variant (Format option 3); pulls ISBN (attr 3, converted to EAN-13 if not 13 chars), price HT → **TTC computed at 5.5 % VAT** (French book rate), dimensions, page count, dates, argumentaire, ebook file. Creates/updates WP `livres` custom posts (matched by `post_name = slug`), sets `collection` taxonomy, thumbnail, and ACF meta. Most `wp_insert_post`/`update_post_meta` blocks are **commented out** now (the import already ran) but the intended **ACF meta keys** are visible: `sous_titre`, `titre_originale`, `date_de_publication`, `date_de_publication_originale`, `prix_papier`, `prix_digital`, `isbn_papier`, `isbn_digital`, `nombre_de_pages`, `cover_largeur`, `cover_hauteur`, `langue_originale`, `fichier_epub`, `livre_auteurs`, `livre_auteurs_preface`, `livre_auteurs_postface`, `livre_traducteurs`, `livre_auteurs_divers`; reciprocal author-side keys `livres_associes`, `livres_preface`, `livres_postface`, `livres_traduits`, `articles_associes`.
- **`ajax_new.php`** (`action=majpreface`) — rebuilds the **contributor-role links** (préface/postface/traduction/autres) between already-migrated WP authors and books, matching by slug (with `_`→`-` fallback). Writes bidirectional post-meta (currently commented out). Confirms the role meta-key names above.
- **`maj_users.php`** — migrates `agone_user` customers, skipping internal `@agone`/`@webu.coop` addresses, deduping via the `clients` table in `db_migration`.
- **`exporthobo.php`** — see HOBO section below.
- **`bellelettre.php`** — see BLDD/distributor section below.
- `ajax.php`, `test.php`, `test2.php`, `Default.html` — older scratch/experimental versions, superseded.

Current WP state (verified via MySQL): **432 `livres`, 992 `auteurs`**, ACF meta populated (`isbn_papier`/`isbn_digital`/`prix_papier`/`prix_digital` = 443 each, `livre_auteurs` = 422, `livre_auteurs_preface` = 179, `nombre_de_pages` = 346). Only **3 `product`** (Woo) posts — books live as the `livres` CPT, not as WooCommerce products. So the catalogue migration is essentially **done**; this app is now historical.

## HOBO — what it is and the export format

**HOBO** is an **external bibliographic-metadata onboarding template**, not accounting software and not an Agone system. `exporthobo.php` fills a supplied Excel template `HOBO_Fonds_Agone.xls` ("Fonds Agone" = Agone backlist). Extracted from the binary: the workbook sheet is named **"Nouveautés"** with a named print range **`Impression_des_titres`**, authored by **"David Doillon"** on **Microsoft Macintosh Excel**. The template's own header cells carry data-entry guidance (see below), i.e. it is a metadata-submission form the publisher fills for a partner/distributor. It is bibliographic reference data (ISBN, title, contributors, price, stock) — it does **not** contain sales or royalty figures.

**Export columns written by `exporthobo.php`** (row 1 headers, then one row per parent book):

| Col | Header | Source |
|---|---|---|
| A | ISBN | paper variant SKU/attr 3, converted to EAN-13 |
| B | Titre | `catalogue_product.title` |
| C | Sous-titre | attr 2 |
| D | Maison d'édition | constant `AGONE` |
| E | Collection | `catalogue_category.name` via `catalogue_productcategory` |
| F | Auteur.ice.s | `products_author_products`, joined `" & "`, format `Prénom NOM` |
| G | Préface | `products_author_products_foreword` |
| H | Postface | `products_author_products_afterword` |
| I | Traduction | `products_author_products_translation` |
| J | Genre / Rayon | derived: collection `Littératures` → `Littérature`, else `Essais` |
| K–M | Thème 1/2/3 | left blank |
| N | Largeur (cm) | attr 11 dimensions, split |
| O | Hauteur (cm) | attr 11 dimensions, split |
| P | Nb de pages | attr 12 |
| Q | Date Parution (d/m/Y) | attr 7 |
| R | Prix Vente TTC | `price_excl_tax` × 1.055, rounded 2 dp |
| S | Argumentaire | attr 8 richtext, stripped, max 700 chars |
| T | STOCK | `partner_stockrecord.num_in_stock` |
| U | FILE | cover filename |
| V,W,X | (debug) | old ISBN / download status / `LIVREID / BOOKID` |

The template's guidance labels (recovered from the `.xls`): *"Auteur.ice.s [Prénom NOM, utiliser "&" pour renseigner plusieurs noms]"*, *"Date Parution JJ/MM/AAAA [se reporter au calendrier joint]"*, *"Genre / Rayon [se reporter au document joint]"*, *"Thème 1/2/3 [se reporter au document joint]"*, *"Argumentaire [700 caractères espaces compris maximum]"*, *"Nb de pages [durée pour les DVD]"* — confirming HOBO expects a controlled Genre/Rayon + Thème vocabulary supplied separately.

Output is returned base64-encoded as `data:...spreadsheet;base64,` and downloaded client-side as `HOBO_fonds_Agone.xlsx`.

## BLDD / distributor connection (`bellelettre.php`)

`bellelettre.php` is an **experimental stub** (lots of debug `echo`s) that tries to pull Agone's **stock/ONIX feed from BLDD = Les Belles Lettres Diffusion Distribution**, Agone's distributor:
- `http://www.bldd.fr/editeurs/stocks.asp?mts=3&yrs=2024&com=excel` (monthly stock export as Excel)
- `http://bd-biblio-onix.bldd.fr/` (ONIX bibliographic feed)
- HTTP **Basic auth**: user `agone`, password `[REDACTED-PWD]` (also see `cookie.txt` holding a live BLDD ASP session cookie).

This is distinct from HOBO: **BLDD is the actual distributor** (holds real stock and, elsewhere, sales/returns). This is the channel that would feed **sales data for royalty statements** — HOBO is only the metadata Agone *sends out*. There is also a separate Belles Lettres integration in the main web root (`~/www/agone.org/public_html/belleslettres` — `majstockbl.php`, `sendcomtobl.php`) noted in the project brief; that is the operational integration, whereas `bellelettre.php` here is an abandoned prototype.

## Cover images (`couvertures/`)

- **Naming convention: `<EAN-13>.png` or `<EAN-13>.jpg`** (e.g. `9782748900019.png`). All Agone books use publisher prefix **`9782748900…` / `978-2-7489-…`**.
- `couvertures/` on disk holds **347 files** (297 png, 50 jpg) — a partial download run.
- Full sets are in four zips totalling ~560 MB: `couvertures_1103.zip` (98 MB), `couvertures_1203.zip` (78 MB), `couvertures_1203b.zip` (232 MB), `couvertures_1303.zip` (153 MB).
- Originals were fetched from `https://admin.agone.org/media/images/<name>.original.<ext>` and re-saved as `<ISBN>.<ext>`. In WP they were then uploaded as attachments whose `post_name = EAN-13`, and linked as the `livres` thumbnail (`maj_agone.php` looks up `SELECT ID FROM wri_posts WHERE post_name='<isbn>' AND post_type='attachment'`).
- **For AGONE 2.0**: migrate covers to R2 keyed by EAN-13 (`covers/<ean13>.<ext>` or `<ean13>.webp`). The ISBN→cover mapping is trivial and stable. The `admin.agone.org` origin and the zips are the fallback source if a given ISBN is missing from `couvertures/`.

## Product reference data that lives (mostly) only in the old pgsql DB

The authoritative pre-WordPress data is the **PostgreSQL `[REDACTED-DB]`** DB (Oscar/Wagtail). Most of it is already copied into WP, but the following are worth a fresh authoritative pull rather than trusting the WP copy:
- **Dual ISBN handling**: old SKUs were ISBN-10 in places; `exporthobo` converts to EAN-13 (falls back to string `CONV IMP` on failure). Both the raw `partner_sku` and the converted EAN exist — reconcile on migration.
- **Price history**: only *current* `price_excl_tax` per variant is stored; there is **no price-history table** here.
- **Print runs / réimpressions**: **not present** anywhere in this app — no tirage/print-run field exists in the modelled schema. If needed for royalties it must come from BLDD or Agone's own accounting.
- **Stock**: `num_in_stock` was a point-in-time value; live stock is BLDD's.
- **Original publication date / original language / original title** (attrs 4/5/6) — useful bibliographic fields present in old DB.

## Relevance to the future droits-d'auteur (royalty) module

- HOBO / this app supplies the **bibliographic backbone** a royalty engine needs: for each ISBN — title, collection, **priced at TTC (5.5 % VAT)** and HT, page count, and crucially the **full contributor-role graph** (main author / préface / postface / traduction / autres), each contributor identified by slug and already linked to WP author posts. Royalty splits are usually per-contributor-role, so this mapping is the core reference.
- HOBO itself carries **no sales/units-sold data** — royalties = units × price × rate × contributor share. The **units** come from elsewhere: WooCommerce orders (`wri_wc_orders` / `wri_woocommerce_order_items`) for direct site sales, and **BLDD** for distributed/bookshop sales (the `bellelettre.php` / `belleslettres` integration). A royalty module must **join catalogue (this metadata) + Woo sales + BLDD sales** by ISBN.
- Recommendation: treat the ISBN as the primary key across catalogue, covers (R2), Woo line items, and BLDD reports. Persist the contributor-role links as first-class relations (not ACF meta arrays) so royalty shares per role are queryable.

## What is worth migrating vs. discarding

**Migrate / keep:**
- The **cover image set** (couvertures + 4 zips) → R2, keyed by EAN-13.
- The **contributor-role model** (main/préface/postface/traduction/autres) — re-model as proper relations in AGONE 2.0.
- The **attribute-id → field semantics** and **collection→term** mappings documented above (spec value).
- A **fresh authoritative export** from the old pgsql DB if it is still alive (bibliographic fields, both ISBN forms, original-edition metadata).

**Discard / do not port:** the PHP migration scripts themselves (one-shot, stale paths, mostly commented out), the scratch `db_migration.clients` table, `ajax.php`/`test*.php`/`Default.html`, and `bellelettre.php` (superseded by the operational `belleslettres` integration).

## Security note (for the architect)

Plaintext credentials are committed in `config.php` (three DBs) and `bellelattre.php`/`cookie.txt` (BLDD Basic-auth `agone:[REDACTED-PWD]` + live session cookie). These are exposed under a public web root behind only `.htaccess Cache-Control: private`. Rotate all of these when standing up AGONE 2.0 and do not carry them forward.
