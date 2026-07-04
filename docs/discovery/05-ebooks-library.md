# Discovery 05 — Ebooks & Online Library ("Ma Bibliothèque")

Scope: how ebooks are sold, stored, entitled, and re-downloaded on the current
AGONE 1.x WordPress/WooCommerce site, and a spec for rebuilding this as an online
library in AGONE 2.0 (SvelteKit + SurrealDB + R2).

---

## TL;DR of the current mechanism

1. There is **no separate "ebook" post**. An ebook is a **format of a `livres`
   post**, flagged by two ACF fields: `prix_digital` (price) + `fichier_epub`
   (the .epub attachment). Only **EPUB** is supported (no PDF ebook path).
2. Sales go through **one generic WooCommerce product, ID 664 ("epub")**. The
   real book identity + price travel as cart-item / order-line-item **meta**
   (`_id_livre`, `format`, `livre_prix`), not as distinct products.
3. **WooCommerce's native downloadable-product machinery is NOT used.** The
   permissions and download-log tables are empty. Entitlement lives in a **custom
   table `agone_mabibliotheque`** populated on payment.
4. The library page re-lists the buyer's books from that table and serves the
   .epub through a **trivial, insecure gate `download.php`** (login-only, no
   ownership check, path-traversal-prone).
5. The .epub binaries sit in **`wp-content/uploads/YYYY/MM/`** and are **publicly
   web-served** (uploads `.htaccess` blocks only PHP), so the download gate is
   effectively cosmetic. No R2, no watermark, no DRM.

---

## 1. Ebook data model

### Custom post type
- CPT: **`livres`** — 432 posts. One post per book (all formats share it).

### Relevant ACF meta on a `livres` post
| ACF field           | Meaning                                    | Example value            |
|---------------------|--------------------------------------------|--------------------------|
| `fichier_epub`      | ACF **File** field → attachment **post ID** of the .epub | `3000`, `8990` |
| `prix_digital`      | Ebook price (€)                            | e.g. `9.99`              |
| `isbn_digital`      | Ebook ISBN-13                              | `9782748905083`          |
| `prix_papier`       | Paper price (€)                            |                          |
| `tarif_souscription`| Subscription/pre-order price               |                          |
| `qte_stock`         | Paper stock qty                            |                          |
| `date_de_publication` | Publication date (multiple formats seen: `d/m/Y`, `Ymd`, `Y-m-d`) |          |
| `date_souscription` | Pre-order cut-off date                     |                          |
| `isbn_papier`       | Paper ISBN-13                              |                          |

Also present as meta keys: `isbn`, `_isbn`, `isbn_digital`/`_isbn_digital`,
`isbn_papier`/`_isbn_papier` (the `_`-prefixed twins are ACF field-key refs).

### "Is this book an ebook?" rule
From `template_agone/addtocart_desktop.php`:
```php
if ($prix_digital && $fichier_epub) { /* show "Format ePub" buy button */ }
```
→ A title is purchasable as ebook **iff both `prix_digital` and `fichier_epub`
are set**. `402` postmeta rows have a non-empty `fichier_epub`.

### Ebook file storage (ground truth)
- `fichier_epub` holds an **attachment ID**; resolved via `wp_get_attachment_url()`
  (code also tolerates an array with `->url`).
- Physical path: `wp-content/uploads/YYYY/MM/<Author_Title>.epub`
  (from `_wp_attached_file`). Examples:
  - `2024/03/TrahisonEditeur-III_Txt_V11.epub`
  - `2025/12/Kraus_TroisiemeNuitDeWalpurgis.epub`
  - `2025/10/Kempf_ViolencesJudiciaires.epub`
- **Naming is by author/title, NOT by ISBN.** (`isbn_digital` exists but is not
  used in filenames.)
- **191 physical `.epub` files, ~878 MB total** (avg ~4.6 MB; range ~280 KB →
  6.7 MB, e.g. `Bouveresse_MytheModerne.epub` 6.72 MB, `Barancy_Misere…` 5.67 MB).
- Format is **EPUB only**. 6 stray PDFs exist in uploads but are unrelated to the
  ebook feature (no PDF ebook ACF field).
- ⚠️ **Discrepancy:** 402 `fichier_epub` meta rows vs 191 physical .epub files —
  some IDs point to the same attachment, or to missing/never-uploaded files, or
  older books were never given a file. Needs reconciliation during migration.

---

## 2. Generic WooCommerce "container" products

These are placeholder products; the actual book + price are injected per line.

| Product ID | `post_title`          | Role                    |
|-----------:|-----------------------|-------------------------|
| 24         | `livre`               | Paper format            |
| **664**    | `epub`                | **Ebook format**        |
| 4084       | `livre (Souscription)`| Subscription / pre-order|

None of these are marked as WooCommerce "downloadable" — confirmed by the empty
permissions table (below).

### Add-to-cart flow (AJAX)
`template_agone/addtocart_desktop.php` posts to `admin-ajax.php`
`action=ajouter_au_panier_ajax` with:
`product_id=664, id_livre=<livres post ID>, quantity=1, livre_type='epub',
livre_prix=<prix_digital>`.

Handler `ajouter_au_panier_ajax()` (functions.php ~L1177):
- Stores cart-item data: `livre_prix`, `id_livre`, `livre_type`, `unique_key`.
- Rejects adding the **same epub twice** ("vous ne pouvez pas ajouter 2 fois le
  même livre epub").
- Per-item price override: `woocommerce_before_calculate_totals` →
  `$value['data']->set_price($value['livre_prix'])` (functions.php ~L1339).
- `cart_remove_qty_epub` forces qty=1 UI for epub lines.

### Order line-item meta
`transmettre_meta_a_commande` (hook `woocommerce_checkout_create_order_line_item`,
~L1432) copies to each order item:
- `_id_livre` = the `livres` post ID
- `format`   = `epub` (or `papier`, etc.)

`display_sku_in_order_item` rewrites the order line label to the real book title
(looked up from `_id_livre`), since the product itself is just "epub".

---

## 3. Entitlement: the custom `agone_mabibliotheque` table

**This is the single source of truth for "who owns which ebook."**

```sql
CREATE TABLE `agone_mabibliotheque` (
  `id`       int NOT NULL AUTO_INCREMENT,
  `id_user`  int NOT NULL,
  `id_livre` int NOT NULL,
  `id_order` int NOT NULL,
  `date_add` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ub` (`id_user`,`id_livre`)   -- one entitlement per user+book
) ENGINE=InnoDB;
```
- **253 rows**, actively growing (latest seen `2026-06-29`). Sample:
  `id=263, id_user=1044, id_livre=3041, id_order=9321, 2026-06-29 11:59:48`.
- `id_user` = WP user ID; `id_livre` = `livres` post ID; `id_order` = WC order ID.

### How rows are created — `add_books_to_user_library()` (functions.php ~L1466)
```php
add_action('woocommerce_payment_complete', 'add_books_to_user_library', 10, 1);
// for each order item:
//   if $product->get_id() == 664 {           // the epub product
//     $id_livre = $item->get_meta('_id_livre', true);
//     $wpdb->insert('agone_mabibliotheque',
//        ['id_user'=>$user_id,'id_order'=>$order_id,'id_livre'=>$id_livre]);
//   }
```
Notes / gotchas for migration:
- Fires on **`woocommerce_payment_complete`** only → **guest checkouts (no
  `get_user_id()`) get `id_user = 0`** and effectively no accessible library.
  Account is required to actually re-download.
- A stale code comment says "ID 644 / 664" but the live check is `== 664`.
- No dedupe beyond the UNIQUE key (a failed insert just logs `BAD INSERT`).

### WooCommerce native tables — NOT used (verified)
| Table | Rows |
|-------|-----:|
| `wri_woocommerce_downloadable_product_permissions` | **0** |
| `wri_wc_download_log` | **0** |
| `wri_wc_product_download_directories` | (default) |
| `wri_wc_customer_lookup` | 2492 (WC analytics, not ebook-specific) |

So the canonical linkage is **NOT** WC's `user → order → permission → file`. It is
**`agone_mabibliotheque(id_user, id_livre)` → `livres` post → ACF `fichier_epub`
attachment → uploads/.epub`**.

---

## 4. The library page ("Ma Bibliothèque") — re-download UX

### Routing
- Default My-Account page redirects to WC endpoint **`ma-bibliotheque`**
  (functions.php `custom_default_account_page`, ~L1538:
  `wp_redirect(wc_get_endpoint_url('ma-bibliotheque'))`).
- Page **717 "ma bibliothèque"** carries shortcode `[template file="mabiblioteque"]`.
  `template_shortcode()` (functions.php L130) does
  `include(locate_template('template_agone/'.$file.'.php'))` → loads
  `template_agone/mabiblioteque.php`.
  *(The `add_rewrite_endpoint('ma-bibliotheque')` registration was not found in the
  theme — likely a stored snippet/WC endpoint; see open questions.)*

### Front-end (`template_agone/mabiblioteque.php`)
- On load, POSTs `admin-ajax.php` `action=fetch_data, pt=mabibal`.
- Renders a UIkit grid: cover image + title per book. Clicking a cover calls
  `getfile(v.ebook.url)`.

### Back-end (`fetch_data_callback()` case `'mabibal'`, functions.php L336)
```php
$id_user = get_current_user_id();
$results = $wpdb->get_results($wpdb->prepare(
   "SELECT * FROM agone_mabibliotheque WHERE id_user = %s", $id_user));
foreach ($results as $r) {
   $title = get_the_title($r->id_livre);
   $pic   = get_the_post_thumbnail_url($r->id_livre, 'full');
   $tmpebook = get_field('fichier_epub', $r->id_livre);
   $ebook->url = is_string($tmpebook)
       ? wp_get_attachment_url($tmpebook)   // attachment ID → URL
       : $tmpebook['url'];                  // ACF array form
}
// returns { livres: [ { title, pic, ebook:{url} }, ... ] }
```

### Download (`getfile()` → `/download.php`)
`getfile(urlfile)` POSTs `urlfile` to `/download.php` as an XHR `blob`, then
triggers a client-side `<a download>` with the basename filename.

### The gate — `download.php` (full, 46 lines, web root)
```php
<?php
require_once('wp-load.php');
if (!is_user_logged_in()) { header('HTTP/1.1 401 Unauthorized'); exit; }
$fileUrl   = $_POST['urlfile'];
$parsedUrl = parse_url($fileUrl);
$chemin    = $parsedUrl['path'];
$finalpath = __DIR__ . $chemin;              // web root + path
$fileContent = file_get_contents($finalpath);
if ($fileContent !== false) {
    header('Content-Type: application/epub+zip');
    header('Content-Disposition: attachment; filename="'.basename($fileUrl).'"');
    echo $fileContent; exit;
}
```

### 🔴 Security problems (must be fixed in the rebuild)
1. **No ownership check.** It only verifies the visitor is *logged in* — not that
   they bought the book. Any of the site's registered users can download **any**
   ebook by supplying its URL. Entitlement (`agone_mabibliotheque`) is checked to
   *render* the library, but **not enforced** at download time.
2. **Path traversal / LFI.** `$finalpath = __DIR__ . parse_url($url)['path']` with
   no allow-listing or realpath sanitization → a crafted `urlfile` can read files
   outside the intended folder.
3. **Files are public anyway.** The .epub lives under `wp-content/uploads/…` which
   is directly web-served; `uploads/.htaccess` only denies `*.php` execution (SGS
   hardening), **not `.epub`**. So the real download URL is fetchable by anyone,
   no login at all. The gate adds no real protection.
4. **No watermark / DRM** of any kind.

---

## 5. Rebuild spec (AGONE 2.0)

### 5.1 Domain model (SurrealDB)
- Keep the **book = one record, ebook = a format** model (mirrors current
  `livres`). On the `book` record store:
  - `price_digital` (money), `isbn_digital` (string, ISBN-13),
    `has_ebook`/derived, plus paper fields.
  - `ebook_file`: R2 object key + `size`, `content_type`
    (`application/epub+zip`), `format: 'epub'`. Design the field as an array to
    allow future PDF, but current data is EPUB-only.
- **Entitlement table** (replaces `agone_mabibliotheque`), e.g. `library_entry`:
  `{ user, book, order, format, acquired_at }`, unique on `(user, book, format)`.
  Migrate all 253 existing rows straight across (map WP user IDs → new user IDs,
  WP `livres` IDs → new book IDs).

### 5.2 Storage → R2
- Move all ~191 `.epub` (~878 MB) into a **private R2 bucket** (no public read).
- **Rename by `isbn_digital`** for stability/dedup, e.g.
  `ebooks/9782748905083.epub`; keep original filename as display/download name.
- Reconcile the 402-vs-191 gap during migration: any `fichier_epub` pointing to a
  missing file → flag the book as "ebook announced but file absent."

### 5.3 Entitlement + re-download flow
- On successful Stripe payment (order paid), for each ebook line create a
  `library_entry` (idempotent on `(user, book, format)`). This is the direct
  analogue of `add_books_to_user_library`, but **require an account** (avoid the
  current `id_user=0` guest gap — force account creation / magic-link at checkout).
- **"Ma Bibliothèque" page**: server-load the current user's `library_entry`
  rows → book title + cover + a download action.
- **Download endpoint** (the correct version of `download.php`): server-side
  `+server.ts` that (a) confirms session user, (b) confirms a `library_entry`
  exists for `(user, book, 'epub')`, then (c) returns a **short-lived R2 signed
  URL** (or streams the object). Never expose a permanent public URL. Optionally
  log each download (replaces the never-used `wc_download_log`).
- Optional hardening: per-user **watermarking** of the EPUB (stamp buyer email on
  a page) at download time — not present today, would be new.

### 5.4 Purchase modeling
- Drop the "one generic product 664 + line-item meta" hack. In 2.0 the ebook is a
  first-class purchasable variant of the book with its own `price_digital`; the
  cart line references the book + `format='epub'` directly. Enforce max-1 per
  ebook per cart (as today).

---

## Open questions for the architect
1. Where is `add_rewrite_endpoint('ma-bibliotheque')` registered? Not in theme
   `functions.php`; likely a stored code snippet or WC settings. Confirm so the
   full My-Account menu is replicated (post 717 + endpoint).
2. Guest purchases currently land as `id_user=0` (unrecoverable library). Should
   2.0 **force account creation** at checkout for any ebook, and can we
   retroactively reconcile past guest ebook orders (match by email → user)?
3. Reconcile **402 `fichier_epub` meta vs 191 physical files** — are the missing
   ones deliberately unreleased, or lost? Which list is authoritative for the
   migration?
4. Files named by author/title today; OK to canonicalize to `isbn_digital` in R2,
   and what about the ~books with no `isbn_digital`?
5. Do we want per-user **watermarking/DRM** in 2.0 (new capability), or keep plain
   EPUB behind a signed-URL + ownership check?
6. PDF ebooks: none exist today (EPUB-only). Confirm whether 2.0 must support PDF
   (affects whether `ebook_file` stays single-format).
