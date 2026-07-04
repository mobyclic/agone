# Discovery 04 — Belles Lettres (BL / BLDD) Distributor Integration

Reverse-engineered from PRODUCTION (read-only) on 2026-07-04.

Source files (all under `~/www/agone.org/public_html/belleslettres/`):
- `majstockbl.php` (13 023 b, last modified 2024-11-06) — **stock IN** (import BL stock into Agone).
- `sendcomtobl.php` (22 866 b, last modified 2025-01-05) — **orders OUT** (export Agone orders as EDI to BL FTP).
- `sent/` — 749 files, `CDAGO*.txt`, range 2024-04-30 → 2026-07-03 (archive of successfully-sent EDI files).
- `tosend/` — staging dir, normally empty (transient; file lives here only between write and successful FTP upload).
- `cookie.txt` — libcurl Netscape cookie jar for the BLDD extranet session (overwritten each stock run).
- `php_errorlog` — only benign `DOMDocument::loadHTML()` HTML-parse warnings from majstockbl.php line 227.

Belles Lettres is **BLDD** (Les Belles Lettres Diffusion Distribution), Agone's book distributor. Two independent jobs, both run by cron (see cadence below).

Agone GLN / gencode used everywhere in the EDI: **`3052325760012`** (13-digit EAN/GLN identifying Agone as the supplier).

---

## PART A — `majstockbl.php` — STOCK IMPORT (BL → Agone)

### IMPORTANT CORRECTION vs. the brief
It is **NOT** an FTP pull and **NOT** an Excel file parse. It is an **authenticated HTTP scrape of the BLDD extranet HTML page**. The URL carries `com=excel` but the response is an **HTML `<table>`** parsed with `DOMDocument`. There is no XLS/CSV file involved. (The `use PhpOffice\PhpSpreadsheet...` imports at the top are commented out / dead.)

### Step 1 — Load Agone catalogue from WordPress
- `WP_Query` over CPT **`livres`**, `posts_per_page => -1` (all books).
- Per post it reads two **ACF fields**:
  - `isbn_papier` — the EAN13 / ISBN (the join key).
  - `qte_stock` — current stock quantity.
- Builds `$books_wp[$isbn] = ['ID'=>post_id, 'titre'=>..., 'stock'=>qte_stock, 'traite'=>0]`.
- Validation: books with empty `isbn_papier` → skipped into `$bad` ("PAS ISBN"); duplicate ISBN across Agone catalogue → skipped ("ISBN EN DOUBLE SITE AGONE").
- **Stock lives in ACF `qte_stock` postmeta on the `livres` CPT — NOT in WooCommerce `_stock` / SKU.** There is no WooCommerce product-stock write here at all.

### Step 2 — Authenticate to the BLDD extranet
- cURL `POST http://www.bldd.fr/editeurs/traitlog.asp`
- POST body: `login=agone`, `mdp=[REDACTED-PWD]`, `Submit=Envoyer` (`http_build_query`).
- Full browser-mimic headers (Host `www.bldd.fr`, Origin/Referer `http://www.bldd.fr/editeurs/...`, Firefox UA).
- Session cookie (`ASPSESSIONID...`) saved to `cookie.txt` (COOKIEJAR + COOKIEFILE). Classic ASP session.

### Step 3 — Fetch the stock page
- cURL `GET http://www.bldd.fr/editeurs/stocks.asp?mts={month}&yrs={year}&com=excel&orderfield=18&orderdir=desc`
  - `mts` = current month (`date('n')`, no leading zero), `yrs` = current year (`date('Y')`).
  - Sends the session `Cookie:` from step 2.
- Response is HTML. Parsed with `DOMDocument::loadHTML()` → iterate `<tr>`, require row to have **≥ 19 `<td>`**.
- **Column mapping (0-indexed `<td>`):**
  - `td[0]` = auteur
  - `td[1]` = titre
  - `td[3]` = **ISBN / EAN** (join key)
  - `td[18]` = **stock** (absolute quantity available at BL)
- Skips the header rows (`$i==1` continue) and any duplicate ISBN in the BL feed ("ISBN EN DOUBLE BELLE LETTRES").
- Builds `$books_bl[$isbn] = ['auteur'=>.., 'titre'=>.., 'stock'=>.., 'traite'=>0]`.
- Note: there is NO explicit availability/dispo code column captured — only a numeric stock quantity from `td[18]`.

### Step 4 — Reconcile & write stock
```php
foreach ($books_bl as $isbn => $b) {
  if (isset($books_wp[$isbn])) {
    $id_book   = $books_wp[$isbn]['ID'];
    $old_stock = $books_wp[$isbn]['stock'];
    $new_stock = $books_bl[$isbn]['stock'];      // BL absolute value
    update_field('qte_stock', $new_stock, $id_book);   // ACF write, OVERWRITE (not delta)
  }
}
```
- Match is purely by **ISBN/EAN equality** (`isbn_papier` ACF ⇄ BL `td[3]`).
- Write is an **absolute overwrite** of ACF `qte_stock` with the BL value. `$delta` is computed for display/email only.
- Books present in Agone but absent from the BL feed are left untouched.

### Step 5 — Email report
- Builds an HTML table (TITRE / AUTEUR / EAN / OLD STOCK / STOCK / +/- with red/green delta).
- Sends via **Brevo (ex-Sendinblue) transactional API**: `POST https://api.brevo.com/v3/smtp/email`, header `api-key: [REDACTED-BREVO-KEY]`.
- From `editions@agone.org` ("AGONE"); To currently only `alistair.marca@gmail.com` (the `discepolo@agone.org` recipient is commented out).
- Subject: `Stocks Belles Lettres {d/m/y}`.

### TS re-implementation notes (stock import)
- Replace HTML scrape with the same authenticated flow OR (preferable) ask BL for a real feed. If keeping the scrape: POST login → keep ASP session cookie → GET `stocks.asp?...&com=excel` → parse HTML table, take cols 0/1/3/18.
- Join on EAN; upsert absolute stock onto the book record. In AGONE 2.0 the equivalent of `qte_stock` needs to be identified (SurrealDB book field).
- Send report mail via Resend instead of Brevo.
- **Note the `mts`/`yrs` params default to the current month** — so it only ever pulls the *current month's* stock view.

---

## PART B — `sendcomtobl.php` — ORDER EDI EXPORT (Agone → BL FTP)

Selects paid orders, renders a fixed-width EDI "commande" text file, FTP-uploads it to BL, then archives + flips order status. Runs **twice a day** (cron; `sent/` timestamps cluster at ~08:30 and ~20:30 local).

### Order selection (two passes)
This code uses the **LEGACY post-based order store** (`WP_Query post_type=shop_order`, and `$wpdb->update($wpdb->prefix.'posts', post_status=...)`). It does **NOT** use HPOS `wri_wc_orders`. Confirm which store is authoritative before porting.

**Pass 1 — `post_status = 'wc-processing'`** (all processing orders):
Per line item it reads item meta:
- `format` (`$article->get_meta('format')`) — either `papier` or `souscription`.
- `_id_livre` (`$article->get_meta('_id_livre')`) — the Agone `livres` post ID; ISBN fetched via `get_field('isbn_papier', $id_livre)`.

Item handling:
- **`format == 'papier'`** → always included. `$nblivres++`.
- **`format == 'souscription'`** (pre-order/subscription title) → included **only if the book's ACF `date_souscription` (stored `d/m/Y`) == today (`Ymd`)**. Otherwise the item is held and the order id goes to `$idcomstoupdate_subscription`.
- Poster detection: ISBN **`9782748906035`** counted as `$nbposter`; anything else `$otherthanposter` (drives shipping code, see below).

An order emits an EDI block only if `$nblivres > 0`.

**Pass 2 — `post_status = 'wc-subscription'`** (parked subscription orders):
Re-checks each subscription line's `date_souscription`; if it equals today, the order is released (emitted, and added to `$idcomstoupdate` → will be completed).

### De-dup / tracking mechanism (CRITICAL)
There is **no separate "sent" flag** — tracking is done via **WooCommerce order status transitions**, applied only AFTER a successful FTP upload:
- `$idcomstoupdate` (pure orders, `nbsubscription==0`, that were emitted) → set to **`wc-completed`**. They will never be re-selected by Pass 1.
- `$idcomstoupdate_subscription` (orders whose subscription date hasn't arrived) → set to **`wc-subscription`** (parked out of `wc-processing`; released later by Pass 2).
- The status writes happen via direct `$wpdb->update` on `wri_posts` **only inside the `if ($result)` FTP-success branch** and only after `rename(tosend → sent)` succeeds.
- Consequence: if FTP fails, the file stays in `tosend/`, NO status is changed, and the same orders are picked up next run (safe re-send, but produces a fresh filename each time).
- The `sent/` folder is therefore the append-only audit log of everything successfully transmitted; `tosend/` should be empty at rest.

> ⚠️ Open question / latent bug: an order containing **both** a `papier` item and a not-yet-due `souscription` item emits its papier lines every run (nblivres>0) but, because `nbsubscription>0`, is NOT added to `$idcomstoupdate` — it is instead flipped to `wc-subscription`. So it leaves `wc-processing` and won't loop, but the paper items get sent while the order is parked as a subscription. Confirm intended behaviour.

### File naming & staging
- Filename: `CDAGO` + `date("YmdHis")` + `.txt`  → e.g. `CDAGO20260702083004.txt`. ("CD" = commande, "AGO" = Agone.)
- Written to `belleslettres/tosend/{filename}` (fopen append + fwrite + fclose).
- FTP uploaded, then `rename()` moved to `belleslettres/sent/{filename}`.

### FTP target (DO NOT CONNECT — noted for porting; SEND MUST STAY DISABLED until prod)
- Host: `[REDACTED-FTP-HOST]`
- User: `[REDACTED-FTP-USER]`
- Pass: `[REDACTED-PWD]`
- Upload via cURL `ftp://[REDACTED-FTP-USER]:[REDACTED-PWD]@[REDACTED-FTP-HOST]//{filename}` (plain FTP, `CURLOPT_UPLOAD`, remote path = root, leading `/` + filename → effectively `//filename`).

### EDI FILE FORMAT — fixed-width, one **A/B/C** record group per order

Encoding: text run through `iconv('UTF-8','ASCII//TRANSLIT', ...)` (accents stripped to ASCII). Line terminator: **CRLF (`\r\n`)**. Padding via `mb_str_pad`. Each order = one **A** line (header/ship-to), one **B** line (shipping method + contact), then one **C** line per book.

**A record (225 chars + CRLF) — order header + delivery address:**

| Offset | Len | Field | Source / rule |
|--------|-----|-------|---------------|
| 0 | 1 | Record type | literal `A` |
| 1 | 13 | Agone GLN | literal `3052325760012` |
| 14 | 8 | Order number | `X` + `sprintf("%07d", order_number)` → e.g. `X0009330` |
| 22 | 13 | Agone GLN (repeat) | literal `3052325760012` |
| 35 | 6 | Order date | `date_created->format('dmy')` (DDMMYY) |
| 41 | 9 | Filler | 9 spaces |
| 50 | 32 | Recipient name | `prenom + ' ' + nom`, left-justified, space-padded, truncated 32 |
| 82 | 32 | Company | billing/shipping company |
| 114 | 32 | Address line 1 | shipping_address_1 (falls back to billing if shipping empty) |
| 146 | 32 | Address line 2 | address_2 |
| 178 | 9 | Postcode | postcode |
| 187 | 35 | City | city |
| 222 | 3 | Country | `FR` → `100`; otherwise the raw ISO country code, space-padded to 3 |

**Address source rule:** if `shipping_address_1` is empty → use ALL **billing** fields (name/company/addr/cp/city/country/phone); else use **shipping** fields (phone always from billing in pass 1, from shipping in pass 2).

**B record (204 chars + CRLF) — shipping method + contact:**

| Offset | Len | Field | Source / rule |
|--------|-----|-------|---------------|
| 0 | 1 | Record type | literal `B` |
| 1 | 109 | Filler | 109 spaces |
| 110 | 9 | Shipping/colisage code | see rules below |
| 119 | 75 | Email | billing/shipping email, TRANSLIT, padded 75 |
| 194 | 10 | Phone | phone, padded 10 |

Colisage (shipping-method) code rules:
- Country FR: default **`AGOCOLCOL`** (Colissimo parcel). If the order is *poster-only* (`otherthanposter==0 && nbposter>0`) → **`AGOLETLTR`** (letter mail).
- Country ≠ FR: **`AGOBROBRO`** (foreign / "broché" shipping).
- (Subscription pass 2 uses only `AGOCOLCOL` for FR, `AGOBROBRO` otherwise — no poster/letter special case.)

**C record (20 chars + CRLF) — one per book line, repeated:**

| Offset | Len | Field | Source / rule |
|--------|-----|-------|---------------|
| 0 | 1 | Record type | literal `C` |
| 1 | 13 | EAN / ISBN | `isbn_papier`, **zero-padded LEFT** to 13 |
| 14 | 6 | Quantity | quantity, **zero-padded LEFT** to 6 |

### Real captured example (`CDAGO20260702083004.txt`, `cat -A`, `^M$` = CRLF)
```
A3052325760012X00093303052325760012020726         brune seban                     <32>...108 rue de la fraternite         <32>...93170    bagnolet                           100^M$
B                                     <109sp>                                   AGOCOLCOLbrune.seban@gmail.com          <75>...0684159273^M$
C9782748906233000001^M$
A3052325760012X00093293052325760012010726         Laurent Pantera  ... 100^M$
B ... AGOCOLCOLlaurent.pantera@free.fr ... +334423924^M$
C9782748901320000001^M$
```
Multi-book order (from `CDAGO20260629083005.txt`) shows two consecutive C lines under one A/B group:
```
A3052325760012X0009317305232576001227062...  Christine LAPALISSE ... 100^M$
B ... AGOCOLCOL christine.lapalisse@gmail.com ... 0607135471^M$
C9782748906196000001^M$
C9782748905915000001^M$
```
Decoding the header of order X0009330: GLN `3052325760012`, order # 9330, GLN again, date `020726` = 02/07/2026, qty `000001` of EAN `9782748906233`, Colissimo, FR (`100`).

### TS re-implementation notes (order export)
- Byte-exact fixed-width builder: A=225, B=204, C=20, each + `\r\n`; ASCII//TRANSLIT the text; left-pad EAN/qty with `0`, right-pad text with space; truncate to field length first.
- Constants: GLN `3052325760012`; order ref `X` + 7-digit zero-padded number; poster EAN `9782748906035`; colisage codes `AGOCOLCOL` / `AGOLETLTR` / `AGOBROBRO`; FR→`100`.
- Replicate the two-pass selection (processing + parked subscriptions) and the `date_souscription == today` release gate.
- Replicate status-transition de-dup: on successful upload → completed; parked subs → subscription state. **Keep FTP SEND DISABLED until prod** — write the file to a local `tosend/` equivalent and log; do not upload.
- Filename `CDAGO{YYYYMMDDHHMMSS}.txt`; move to `sent/` archive on success only.
- Determine the AGONE 2.0 equivalents of: WooCommerce order statuses (processing/completed/subscription), line-item `format` + `_id_livre` meta, and ACF `isbn_papier` / `date_souscription` on books.

---

## Cadence / cron
- `sendcomtobl.php`: twice daily, ~08:30 and ~20:30 (inferred from `sent/` mtimes, e.g. `...083004`, `...203004`). Cron entry itself not in this folder — check server crontab in a later pass.
- `majstockbl.php`: run frequency not evidenced by artifacts (cookie.txt last written 2026-07-03; log only shows manual 2024 runs). Confirm its schedule.

## Credentials inventory (for secrets migration — rotate on cutover)
- BLDD extranet: `www.bldd.fr`, login `agone` / `[REDACTED-PWD]`.
- BL FTP: `[REDACTED-FTP-HOST]`, `[REDACTED-FTP-USER]` / `[REDACTED-PWD]`.
- Brevo API key: `[REDACTED-BREVO-KEY]`.

## Open questions for the architect
1. Stock import is an HTML scrape of the BLDD ASP extranet, not an Excel/FTP pull — is there an official BL stock feed we should switch to instead of scraping?
2. Legacy post-based orders (`wri_posts` + status meta) are used, not HPOS. Which store is authoritative in AGONE 2.0's data model?
3. Mixed paper+future-subscription orders: paper lines are emitted while the order is parked as `wc-subscription` — intended?
4. Country field is 3 wide with FR→`100` but other countries use 2-letter ISO — confirm BL's expected country coding for non-FR.
5. Where are `format` / `_id_livre` line-item meta and `isbn_papier` / `date_souscription` / `qte_stock` book fields represented in the new schema?
6. `majstockbl.php` only ever queries the current month (`mts`/`yrs`) — acceptable, or should it pull a full/rolling window?
