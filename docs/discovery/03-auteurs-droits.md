# Discovery 03 — Auteurs & Droits d'auteur (Royalties)

**Scope:** Map the `auteurs` custom post type (983 published) and inventory everything relevant to a NEW *droits d'auteur / redevances* (author royalties) backoffice module — what data already exists vs. what is entirely missing.

**DB:** `[REDACTED-DB]`, prefix `wri_`. WooCommerce present but **HPOS is NOT active** — `wri_wc_orders` is empty (0 rows); orders live in legacy `wri_posts (post_type=shop_order)`.

---

## 1. The `auteurs` post type — record structure

**Counts:** 983 published, 3 draft, 6 trashed. ~992 have `nom`/`prenom` meta.

The author record is **deliberately minimal**. There is NO ACF field for nationality, birth/death, website, pseudonyms, or photo.

| Data | Where stored | Notes |
|------|--------------|-------|
| Full display name | `wri_posts.post_title` | e.g. "Alain Accardo" |
| Last name | `postmeta.nom` (+ ACF `_nom`) | ACF field `field_651bc85dd682d`, **required** |
| First name | `postmeta.prenom` (+ `_prenom`) | ACF field `field_651bc873d682e` |
| Biography | `wri_posts.post_content` | HTML, e.g. `<em>…</em>` markup. This is the ONLY bio store. |
| Photo | **NONE** | `_thumbnail_id` count on `auteurs` = **0**. Authors have no featured image. |
| Hide from listing | `postmeta.hide_on_list` | boolean flag (743 rows), true/false |
| SEO / push meta | `_yoast_*`, `sib_push_*` | not relevant to royalties |

### ACF field group for authors
`acf-field-group` **ID 243 = "information auteur"** (`group_651bc865d08a7`), location = post_type `auteurs`. Fields:
- `nom` (text, required), `prenom` (text)
- 5 book-relationship fields (see §2)
- `articles_associes` (relationship → `post`), `rencontres_associees` (relationship → `rencontres`)

That is the complete author schema. **No contract, percentage, payment, or fiscal fields exist.**

---

## 2. Author ↔ Book link, and ROLE per book

Role is **encoded by *which* relationship field** connects author and book — there is no single link table with a role column, and **no share/percentage anywhere**. Every link is an ACF *bidirectional* pair: stored as a PHP-serialized array of post IDs on **both** the author side and the book side.

### On the author (`auteurs`, group 243)
| ACF field | Label | Role | Bidir. target (on livre) |
|-----------|-------|------|--------------------------|
| `livres_associes` (`field_651d617e67962`, type=relationship) | "A écrit ou co-écrit les livres suivants" | **Auteur principal** | `livre_auteurs` |
| `livres_traduits` (`field_65f9672b7c8a9`) | "A traduit les livres suivants" | **Traducteur** | `livre_traducteurs` |
| `livres_preface` (`field_66019f2660db2`) | "A préfacé…" | **Préfacier** | `livre_auteurs_preface` |
| `livres_postface` (`field_66019f444527d`) | "A postfacé…" | **Postfacier** | `livre_auteurs_postface` |
| `livres_divers` (`field_66019f561f843`) | "A participé aux livres suivants" | **Divers / contributeur** | `livre_auteurs_divers` |

### On the book (`livres`, group **1555 = "Collaborateurs"**, `group_65f969d592458`)
| ACF field | Label |
|-----------|-------|
| `livre_auteurs` (`field_65f969d6ae424`) | "Auteur(s) principaux" |
| `livre_traducteurs` (`field_65f96c0a64ade`) | "Traducteurs" |
| `livre_auteurs_preface` (`field_65f96bb964adc`) | "Auteur(s) de la préface" |
| `livre_auteurs_postface` (`field_65f96bf264add`) | "Auteur(s) de la postface" |
| `livre_auteurs_divers` (`field_65f96c2464adf`) | "Auteur(s) divers" |

**Storage format** (postmeta), e.g. author 246:
```
livres_associes = a:8:{i:0;i:3222;i:1;i:3255; … }   // serialized array of livre post IDs
livres_associes = a:2:{i:0;s:4:"3240";i:1;s:4:"8879";}
```
Link usage counts (authors having ≥1 link): `livres_associes` 281, `livres_traduits` 100, `livres_preface` 87, `livres_postface` 77, `livres_divers` 71.

**Implication for royalties:** the 5 roles line up with the 5 royalty-bearing functions (author / translator / preface / postface / other), but **there is no % share, no ordering of co-authors, and no per-book-per-role contract.** A book with 3 co-authors gives no indication of how royalties split.

---

## 3. The `livres` post type — royalty-relevant book fields

ACF group **100 "Informations Editeur"** (`group_65156f46d2d6b`) on `livres` (432 posts: 386 publ + 46 draft). Relevant fields:
- `isbn_papier` (`field_65f979c1cf4e5`), `isbn_digital` (`field_65eeda483e992`)
- `prix_papier` "Tarif Papier (TTC)" (`field_65564882e77e3`), `prix_digital` "Tarif eBook (TTC)"
- `qte_stock` "Quantité en stock" (`field_661fa8fe22fc8`) — **current stock only, no print-run / tirage history**
- `date_de_publication`, `date_de_publication_originale`, `nombre_de_pages`, `cover_largeur/hauteur`
- `tarif_souscription`, `date_souscription` (subscription/pre-order pricing)
- Collection via `collection` taxonomy (Contre-feux 80, L'Épreuve des faits 76, Éléments 61, Littératures 56, Revue Agone 55, Banc d'essais 52, Œuvres complètes de Rosa Luxemburg 5, …)

No royalty rate, no advance (à-valoir), no contract reference on the book.

---

## 4. Sales data — what CAN feed a royalty calc

**Orders are legacy** `shop_order` posts: **2456 completed orders, date range 2024-05-01 → 2026-07-03** (i.e. only since the WordPress relaunch; no earlier history here).

Sales ARE linked per book. Each order line item (`wri_woocommerce_order_items` type `line_item`) has itemmeta:
- `_id_livre` → the `livres` post ID (3068 rows carry it)
- `_qty`, `_line_total`, `_line_subtotal`, `_line_tax`, `_product_id`, `_variation_id`
- `format` → **`papier` (2457), `epub` (256), `souscription` (353)**, plus a couple of typos (`papioer` 1, `livre` 1)

Only **3 real WooCommerce `product` posts exist** — books are not modelled as WC products; the storefront sells `livres` through generic product/variation containers and records the actual title via `_id_livre`.

**Per-title units sold is directly derivable**, e.g.:
```
id_livre 6181 → 382 units | 3566 → 360 | 7715 → 220 | 6310 → 89 | 3231 → 86 | 557 → 80
```
Query pattern:
```sql
SELECT im2.meta_value AS id_livre, SUM(CAST(im1.meta_value AS UNSIGNED)) units
FROM wri_woocommerce_order_itemmeta im1
JOIN wri_woocommerce_order_itemmeta im2
  ON im1.order_item_id=im2.order_item_id AND im2.meta_key='_id_livre'
WHERE im1.meta_key='_qty' GROUP BY im2.meta_value;
```
Also present: **`agone_mabibliotheque`** (253 rows) = user library — `id_user, id_livre, id_order, date_add` — links ebooks/subscriptions a customer owns.

**BIG CAVEAT — this is only DIRECT web sales.** See §5.

---

## 5. Distribution via Les Belles Lettres (the missing majority of sales)

`~/www/agone.org/public_html/belleslettres/`:
- **`majstockbl.php`** — pulls every `livres` post (`isbn_papier`, `qte_stock`) and reconciles stock against Belles Lettres. BL holds physical stock.
- **`sendcomtobl.php`** — pushes WooCommerce orders (`post_status=wc-processing`) to Belles Lettres for fulfilment/shipping (formats orders with `gencode`, order number `X%07d`, ASCII-transliterated addresses). `sent/` + `tosend/` dirs, active (cookie.txt refreshed 2026-07-03).

**Agone is distributed by Les Belles Lettres.** Bookshop / wholesale sales — the bulk of a publisher's volume and the core of a royalty statement (*reddition de comptes*) — go through BL and are reported by BL. **They are NOT in this database.** The WP sales in §4 are only the publisher's own web shop.

---

## 6. HOBO — what `exporthobo.php` really does

HOBO is **not** an accounting/royalty system in this codebase. `~/www/migration.agone.org/public_html/exporthobo.php` reads the **OLD PostgreSQL database** (a Django/**Oscar** e-commerce: `catalogue_product`, `partner_stockrecord`, `products_author`, `catalogue_category`) and writes a **catalogue/fonds export** to `HOBO_Fonds_Agone.xls`.

Exported columns (A–X): `ISBN, Titre, Sous-titre, Maison d'édition, Collection, Auteur.ice.s, Préface, Postface, Traduction, Genre/Rayon, Thème1-3, Largeur, Hauteur, Nb de pages, Date Parution, Prix Vente TTC, Argumentaire, STOCK, FILE(cover), oldisbn`.

So "HOBO" is a **metadata/catalog feed** (title bibliographic + price + stock + cover), **no sales, no royalties**. Author roles in the old system came from Oscar join tables: `products_author_products` (main), `_foreword` (préface), `_afterword` (postface), `_translation` (traduction), `_others` (divers) — the exact ancestors of today's 5 ACF role fields.

`maj_agone.php` = the one-off migration script (old PG → WP), also bootstraps `wp-load.php`.

---

## 7. Royalty/contract search — RESULT: nothing exists

Grep of themes, mu-plugins and the migration app for `droit|contrat|redevance|(à-)valoir|avance|royalt|cession|tirage|reddition` returned only:
- `template_agone/gestion.php` line 12: `// Vérifier si l'utilisateur a les droits` (a permissions comment)
- yootheme i18n JSON + phpspreadsheet locale files (false positives)

`SHOW TABLES` — non-WP custom tables are: `agone_auteurs`, `agone_livres`, `livres_byauthor`, `agone_mabibliotheque`, `agone_post`, `test`. These are **migration/denormalization helpers**, not royalty tables:
- `agone_auteurs(ID, post_title)`; `agone_livres(ID, post_title, post_content, titre, date_de_publication, date_souscription, tarif_souscription, sous_titre, thumbnail_url)`
- `livres_byauthor(id_auteur, id_livre, titre, sous_titre, post_thumbnails, auteurs, slug_livre)` — a flattened author→book lookup
- `agone_mabibliotheque` (see §4), `agone_post`, `test` (empty scratch)

**No `contrat`, `redevance`, `droit`, `tirage`, `avance`, `reddition` table or field anywhere in the DB or code.**

---

## 8. Inventory: EXISTS vs MISSING for a Droits module

### Already exists (reusable)
- Author identity: 983 authors (nom, prenom, bio HTML). *(No photo, no fiscal/contact/bank info.)*
- Book catalog: 432 livres with ISBN (paper+ebook), TTC prices, pages, publication dates, collection, current stock.
- **Author↔book link with role** (5 roles: auteur / traducteur / préfacier / postfacier / divers), bidirectional.
- **Direct web sales per title per format** (`_id_livre` + `_qty` + `format` + `_line_total`), completed orders 2024-05 → present.
- Customer ebook/subscription ownership (`agone_mabibliotheque`).

### Entirely missing (must be built / sourced)
- **Contract data:** royalty rate (%) per author × book × role; advance / à-valoir; cession of rights, contract dates, term, min-guarantee. NONE.
- **Co-author / co-translator split** (share % when several people share a role). NONE — only an unordered ID list.
- **Print runs (tirages):** only a single current `qte_stock`; no print-run history, no manufacturing cost. NONE.
- **Distribution sales (Les Belles Lettres):** the main sales channel; must be imported from BL reports. NOT in DB.
- **Historical sales pre-2024-05:** live only in the OLD PostgreSQL Oscar DB and/or BL. NOT in this DB.
- **Royalty statement history (reddition de comptes)** and author payments. NONE.
- **Author payment/fiscal identity** (SIRET/AGESSA, IBAN, address). NONE.
- Returns / free copies / SP (service de presse) accounting, needed for net royalty. NONE.

---

## 9. Open questions for the architect
1. **Belles Lettres sales data** — In what form does BL send sales/royalty reports (CSV, XLS, EDI/ONIX, portal)? This is the single biggest data gap; royalties can't be computed from the web shop alone. Is there an existing BL "reddition" file we can inspect?
2. **Historical sales** — should the OLD PostgreSQL Oscar DB (`[REDACTED-DB]`, Django) be mined for pre-May-2024 sales, or do royalty statements only start fresh? *(Note: I was blocked from querying the secondary DBs whose creds sit in `config.php`; that check needs an explicit go-ahead.)*
3. **Contracts** — where do current contract %s live today? Almost certainly spreadsheets / paper outside this system. Need the real royalty model: flat % of PPHT? tiered by tirage? different % for paper vs ebook vs poche? per-role rates?
4. **Co-author splits** — confirm the business rule (equal split? contract-defined per author?). The current data only lists collaborators, not shares.
5. **Author payment identity** — is there an existing supplier/author ledger (accounting software) we should read rather than re-enter IBAN/fiscal data?
6. Should `souscription`-format sales (353) count toward royalties at full or subscription price, and at which date (order vs. publication)?
