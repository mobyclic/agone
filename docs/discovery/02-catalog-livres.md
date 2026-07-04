# Discovery 02 — Catalog: `livres` (Book) Custom Post Type

WordPress prefix `wri_`. Post type `livres` = the Agone product catalog.
Counts (from `wri_posts`): **386 published, 46 draft** (431 total rows carrying meta).

This CPT — NOT WooCommerce `product` — is the real catalog. There are only **3 `product`
posts** in the whole DB; WooCommerce products are essentially unused for books. Ordering /
cart logic against `livres` is custom (out of scope here — see orders agent). Related CPTs:
`auteurs` (992 posts), `rencontres` (events), `post` (blog articles/"articles"),
`attachment` (767).

---

## 1. Post-object level fields (native `wri_posts`)

| Column | Use for a book |
|---|---|
| `post_title` | Book title |
| `post_name` | slug |
| `post_content` | **Book description / présentation** — rich HTML (`<p style=…><strong>…`) |
| `post_excerpt` | Sometimes a short teaser; often empty |
| `post_status` | `publish` (386) / `draft` (46). Draft ≈ "à paraître"/unpublished |
| `post_date` | WP creation date (NOT the parution date — that's ACF `date_de_publication`) |
| `_thumbnail_id` | **Cover image** = WP featured image (attachment ID). 426/431 have one |

There is **no dedicated "à paraître" boolean**. Forthcoming titles are modelled by
`post_status=draft` and/or a future `date_de_publication` (e.g. sample books dated 2026‑09…11
are already `publish` with `qte_stock=0`).

---

## 2. ACF field groups attached to `livres`

Three ACF field groups have location rule `post_type == livres`:

- **Group 100 "Informations Editeur"** (`acf_after_title`, key `group … informations-editeur`) — despite the name this is the **main bibliographic block**.
- **Group 31 "Informations livre"** (`normal`) — association/relation fields + extra WYSIWYG.
- **Group 1555 "Collaborateurs"** (`side`) — the author/translator/contributor relations.

ACF stores values as normal `wri_postmeta` rows: a visible row `key` + a shadow row `_key`
holding the field-key reference. Serialized PHP arrays used for multi/relationship values.
`show_in_rest = 0` on all three groups (no REST exposure).

### Group 100 — "Informations Editeur" (core bibliographic)

| meta_key | Label | ACF type | Notes / format |
|---|---|---|---|
| `sous_titre` | SOUS-TITRE | text | subtitle, e.g. "Suivi de « … »" |
| `titre_originale` | TITRE ORIGINALE | text | original-language title |
| `titre_alternatif` | TITRE ALTERNATIF | text | |
| `langue_originale` | LANGUE ORIGINALE | text | free text e.g. `italien` |
| `date_de_publication` | Date de parution | date_picker | **stored `Ymd`** (e.g. `20260911`), displayed `d/m/Y` |
| `date_de_publication_originale` | Parution originale | date_picker | stored `Ymd`, often empty |
| `prix_papier` | Tarif Papier (TTC) | number | euros, e.g. `15`, `18`, `8` |
| `prix_digital` | Tarif eBook (TTC) | number | euros; often empty |
| `tarif_souscription` | Tarif Souscription | number | pre-order/subscription price (102 books) |
| `date_souscription` | date de fin de souscription | date_picker | subscription end (`Ymd`) |
| `isbn_papier` | ISBN Papier | text | **EAN13, the primary key for distributor sync** (e.g. `9782748906264`) |
| `isbn_digital` | ISBN eBook | text | EAN13 of the ebook |
| `nombre_de_pages` | Nombre de pages | number | page count |
| `cover_largeur` | Largeur | number | **physical book width in cm** (e.g. `13`, `11`, `14`) |
| `cover_hauteur` | Hauteur | number | **physical book height in cm** (e.g. `19.5`, `21`) |
| `qte_stock` | Quantité en Stock | number (min 0) | **stock qty; synced from Belles Lettres (see §6)** |
| `focus` | Focus | true_false | homepage/highlight flag (0/1) |
| `fichier_epub` | fichier epub | file (mime `epub`, return `array`) | stores **attachment ID** of the EPUB (e.g. `2975`); 398 books have one |

> Format = width×height in cm via `cover_largeur`/`cover_hauteur` (there is **no** broché/poche/
> ebook enum on the new schema — physical dimensions replace it). Legacy `format_papier`
> held a "11x18" string (see §5). Ebook availability is implied by `isbn_digital` +
> `prix_digital` + `fichier_epub` being present.

### Group 31 — "Informations livre" (associations + extra content)

| meta_key | Label | ACF type | Notes |
|---|---|---|---|
| `infos_additionnelles` | infos additionnelles | wysiwyg | extra HTML block (e.g. "Ouvrage traduit avec le soutien du CNL") |
| `articles_associes` | Articles associés | post_object (multiple, `post`) | related blog articles; **bidirectional** ↔ `field_651d850ee0dc2` |
| `rencontres_associes` | Evenements associés | post_object (multiple, `rencontres`, publish only) | related events; **bidirectional** ↔ `field_651d847d9dff7` |

Also present in data but defined on *other* CPTs' groups (bidirectional reverse targets that
also write onto some `livres`): `livres_associes` (related books), `auteurs_associes`,
`rencontres_associees` (legacy spelling). Treat `livres_associes` as "related books" links.

### Group 1555 — "Collaborateurs" (THE author relations — critical for royalties)

All five are `post_object`, **`multiple = 1`, `post_type = auteurs`, `return_format = id`,
`bidirectional = 1`**. Value stored as serialized array of `auteurs` post IDs as strings, e.g.
`a:1:{i:0;s:4:"8890";}`.

| meta_key | Label | bidirectional_target (field on `auteurs`) |
|---|---|---|
| `livre_auteurs` | Auteur(s) Principaux | `field_651d617e67962` |
| `livre_auteurs_preface` | Auteur(s) de la préface | `field_66019f2660db2` |
| `livre_auteurs_postface` | Auteur(s) de la postface | `field_66019f444527d` |
| `livre_traducteurs` | Traducteurs | `field_65f9672b7c8a9` |
| `livre_auteurs_divers` | Auteur(s) divers | `field_66019f561f843` |

**Book→Author relation = ACF `post_object` (relationship) to the `auteurs` CPT, stored as
arrays of author post IDs, one field per role (author / preface / postface / translator /
misc).** This is the join to rebuild for royalties: `livres.livre_auteurs[] → auteurs.ID`.
Coverage: `livre_auteurs` 406, `livre_traducteurs` 172, `livre_auteurs_preface` 167,
`livre_auteurs_postface` 162, `livre_auteurs_divers` 157.

---

## 3. Taxonomies

Only **2 real taxonomies** apply to books (both custom): `collection` and `category`.
(`product_cat`, `product_type`, `product_visibility` belong to WooCommerce; `nav_menu`,
`wp_theme` are system.)

### `collection` — publisher collections (14 terms)
| term | slug | count |
|---|---|---|
| Contre-feux | contre-feux | 80 |
| L'Épreuve des faits | l_epreuve_des_faits | 76 |
| Éléments | elements | 61 |
| Littératures | litteratures | 56 |
| Revue Agone | revue-agone | 55 |
| Banc d'essais | banc-dessais | 52 |
| Œuvres complètes de Rosa Luxemburg | oeuvres-completes-de-rosa-luxemburg | 5 |
| Carte de l'édition française | carte-de-ledition-francaise | 1 |
| Cent mille signes, Manufacture de proses, Épreuves sociales, Dossiers noirs, Mémoires sociales, L'Ordre des choses | … | 0 (defined, unused) |

`_yoast_wpseo_primary_collection` postmeta (110 books) marks the **primary collection** when a
book is in several.

### `category` — thematic rayons (13 terms)
| term | slug | count |
|---|---|---|
| Inactualités | inactualites | 413 |
| L'Ordre médiatique | lordre-mediatique | 144 |
| Tout le reste est littérature | tout-le-reste-est-litterature | 139 |
| Révolution sociale ou barbarie | revolution-sociale-ou-barbarie | 137 |
| Raison garder | raison-garder | 97 |
| À quoi sert l'École | a-quoi-sert-lecole | 89 |
| Impérialismes | imperialismes | 3 |
| Uncategorized | uncategorized | 1 |
| Chroniques américaines / européennes / …, JMarc Rouillan, JP Garnier, Alain Accardo | … | 0 (these are blog-article categories, not book rayons) |

> Note: `category` is shared between `livres` and blog `post`s. Counts >386 (e.g. Inactualités
> 413) confirm it spans both post types. No separate `theme`/`serie`/`rayon` taxonomy exists —
> "thèmes/rayons" = `category`; "séries" is not modelled as a taxonomy (series like the Rosa
> Luxemburg Œuvres complètes are expressed via `collection`).

Terms via `wri_terms` + `wri_term_taxonomy`, relations via `wri_term_relationships`.

---

## 4. Cover images

- **Primary storage = WP featured image** (`_thumbnail_id` → `attachment` post ID). 426/431 books.
- Attachment files live under `wp-content/uploads/YYYY/MM/` with **arbitrary editorial
  filenames**, NOT ISBN-named — e.g. `Gandini_DroitsHumains_Couv_V5.jpg`,
  `Muehloff_IAFascisme_UNE5.png`. Mix of `.jpg`/`.png`.
- `cover_largeur`/`cover_hauteur` are the *physical book* dimensions (cm), unrelated to image px.
- **Legacy ISBN-named covers** exist only in the migration app:
  `~/www/migration.agone.org/public_html/couvertures/<ISBN13>.png|jpg` — **347 files**, named
  exactly by EAN13 (`9782748900019.png` …), dated Mar 2024. Useful as a migration source to
  backfill covers by ISBN, but the live site uses the featured image, not these.

---

## 5. Legacy / migration meta keys (pre-refactor; small counts — do NOT rebuild as-is)

These are superseded by the group‑100/1555 fields above; only a handful of old posts retain them:

| legacy key | count | superseded by | example |
|---|---|---|---|
| `isbn` | 17 | `isbn_papier` | `9782748905250` (EAN13) |
| `format_papier` | 17 | `cover_largeur`/`hauteur` | `11x18` (cm string) |
| `auteur` | 6 | `livre_auteurs` | `a:1:{i:0;s:3:"105";}` (auteurs IDs) |
| `traducteurs` | 3 | `livre_traducteurs` | |
| `sous-titre` | 7 | `sous_titre` | |
| `auteurs_associes` | 18 | (reverse of `livre_auteurs`) | mostly empty arrays |
| `auteurs_0_auteur` / `auteurs` | 2 | old ACF repeater remnant | |

Migration/mapping logic lives in `~/www/migration.agone.org/public_html/` (`maj_agone.php`,
`exporthobo.php`, `HOBO_Fonds_Agone.xls`) — the source system was **HOBO** (an accounting/stock
package); the XLS is the fonds export. Keyed by ISBN13.

---

## 6. Distributor / stock sync — Belles Lettres (BLDD)

`~/www/agone.org/public_html/belleslettres/majstockbl.php` (cron, ~monthly) syncs stock:

1. Loads all `livres`, reads `get_field('isbn_papier')` + `get_field('qte_stock')`, indexes
   books by ISBN (skips books with no ISBN, flags duplicate ISBNs).
2. Logs into **bldd.fr** (Les Belles Lettres Diffusion Distribution) — POST `traitlog.asp`,
   creds `login=agone` / `mdp=[REDACTED-PWD]`, keeps session cookie (`cookie.txt`).
3. Downloads the monthly stock table: `GET stocks.asp?mts=<month>&yrs=<year>&com=excel&orderfield=18&orderdir=desc`, parses the returned HTML `<tr>/<td>` grid (≥19 columns).
4. **Matches BL rows to books by ISBN13 (= GENCOD/EAN)** and updates `qte_stock`.

So: **the distributor is BLDD; the join key between Agone and the distributor is the paper
ISBN13 (`isbn_papier`).** There is no separate "BL code" field — GENCOD == the ISBN.
Order transmission to BL is handled by the sibling `sendcomtobl.php` (+ `tosend/`, `sent/`
spool dirs) — orders domain, not catalog.

---

## 7. Field-by-field spec of a rebuilt book record

```
Book {
  id / slug                     ← post_name
  title                         ← post_title
  subtitle                      ← sous_titre
  title_original                ← titre_originale        (title_alt ← titre_alternatif)
  language_original             ← langue_originale
  description_html              ← post_content
  extra_info_html               ← infos_additionnelles
  status                        ← post_status (published | draft≈forthcoming)

  isbn_paper (EAN13, unique)    ← isbn_papier            [distributor key]
  isbn_ebook (EAN13)            ← isbn_digital
  price_paper_ttc  €            ← prix_papier
  price_ebook_ttc  €            ← prix_digital
  subscription_price €          ← tarif_souscription
  subscription_end  date        ← date_souscription      (Ymd)

  published_at      date        ← date_de_publication     (stored Ymd)
  published_original date       ← date_de_publication_originale
  page_count                    ← nombre_de_pages
  width_cm / height_cm          ← cover_largeur / cover_hauteur
  stock_qty                     ← qte_stock  (synced from BLDD by ISBN13)
  featured                      ← focus (bool)
  epub_file                     ← fichier_epub (attachment/asset ref)

  cover_image                   ← _thumbnail_id → attachment (uploads/YYYY/MM/…)

  collection[]  (taxonomy)      ← collection terms  (+ primary via yoast primary_collection)
  categories[]  (taxonomy)      ← category terms (rayons/thèmes; shared with blog)

  authors[]                     ← livre_auteurs            → auteurs.ID   ┐
  translators[]                 ← livre_traducteurs        → auteurs.ID   │ all = ACF post_object
  preface_authors[]             ← livre_auteurs_preface    → auteurs.ID   │ arrays of auteurs IDs
  postface_authors[]            ← livre_auteurs_postface   → auteurs.ID   │ (role-typed)
  misc_contributors[]           ← livre_auteurs_divers     → auteurs.ID   ┘

  related_books[]               ← livres_associes
  related_articles[]            ← articles_associes  → post
  related_events[]              ← rencontres_associes → rencontres
}
```

---

## Open questions for the architect

1. **Format enum**: new schema has no broché/poche/PDF/EPUB type — only cm dimensions + presence
   of ebook fields. Does AGONE 2.0 want an explicit `format` enum, or keep dimensions + derived
   ebook availability?
2. **Author roles**: 5 role-typed relations today (author/preface/postface/translator/divers).
   Royalty rules probably differ per role + need a % / contract per book–author pair — none of
   that exists in WP. Confirm the royalty model so we can design a proper `book_contributor`
   join table (role, share%, contract ref) rather than 5 arrays.
3. **Collection vs series**: no `series` taxonomy; multi-volume works (Rosa Luxemburg) ride on
   `collection`. Do we need a first-class series/volume-number concept?
4. **`category` is shared with blog posts** and includes non-book terms. Split into a
   book-specific `rayon`/`theme` taxonomy in v2?
5. **Stock source of truth**: `qte_stock` is overwritten monthly by BLDD scraping of `bldd.fr`
   (fragile HTML scrape, hard-coded creds). Keep BLDD as authority and design a proper API/feed,
   or move stock in-house?
6. **Covers**: live covers are editorial-named featured images (426/431); ISBN-named covers only
   in the legacy `couvertures/` migration folder (347). Which is the migration source of truth,
   and how to backfill the 5 books with no cover?
```
