# Discovery 01 — Shop / WooCommerce (how books are sold on agone.org)

Server: `c120581.sgvps.net`, WP root `~/www/agone.org/public_html`, DB prefix `wri_`.
WooCommerce 10.8.1 (order `_order_version` shows 10.8.1). READ-ONLY findings.

---

## 1. The core surprise: 3 generic products, NOT one product per book

There are only **3 `product` posts**, all priced **0**, used as generic "containers":

| product ID | title | type | role | line items using it |
|-----------|-------|------|------|--------------------|
| **24** | `livre` | physical (`_virtual=no`, `_downloadable=no`) | printed book | 2394 |
| **664** | `epub` | virtual + downloadable (`_virtual=yes`, `_downloadable=yes`) | ebook | 323 |
| **4084** | `livre (Souscription)` | physical | pre-order / souscription | 356 |

All three have `_price=0`, `_regular_price=0`, `_manage_stock=no`, `_stock_status=instock`, `_tax_status=taxable`, `_tax_class=''` (standard). `total_sales` on them: 24→2462, 664→354, 4084→371.

**The real product is the `livres` Custom Post Type** (386 published, 46 draft). Each purchased book is a `livres` post; identity + price are injected onto the WooCommerce line item at checkout. There is **no per-book WC product, no WC SKU, no WC stock**. Stock lives on the `livres` post (`qte_stock`).

### How a book gets into the cart (theme `wp-content/themes/agone/functions.php`)
The active theme is **`agone`** (child of `yootheme`). Add-to-cart links carry query params `?id_livre=&livre_prix=&livre_type=`:

- `woocommerce_add_cart_item_data` (`ajouter_donnees_produit_au_panier`, ~L1331): copies `$_GET['livre_prix']`, `$_GET['id_livre']`, `$_GET['livre_type']` (the format) into cart item data + a random `unique_key` to keep each book a distinct cart line.
- `woocommerce_before_calculate_totals` (`ajuster_prix_panier`, ~L1344): `$value['data']->set_price($value['livre_prix'])` — overrides the generic product's 0 price with the book price at runtime.
- `woocommerce_checkout_create_order_line_item` (`transmettre_meta_a_commande`, ~L1443): writes `_id_livre` and `format` onto the order line item.
- `woocommerce_order_item_name` (`display_sku_in_order_item`): replaces the item display name with the `livres` post title.

`livres` postmeta that feeds this (both ACF `field` and `_field` copies exist):
`prix_papier`, `prix_digital`, `tarif_souscription`, `isbn_papier`, `isbn_digital`, `qte_stock`, `fichier_epub` (+ `nombre_de_pages`, `date_de_publication`, `date_souscription`, `sous_titre`, etc.).
Example `livres` 7715: `prix_papier=18`, `isbn_papier=9782748906233`, `qte_stock=331`.

**`format` values across all line items** (this is the book edition sold): `papier` 2457, `epub` 256, `souscription` 353, plus data-quality typos `papioer` (1) and `livre` (1).

---

## 2. Order storage — LEGACY is authoritative, HPOS is EMPTY

- **HPOS tables exist but are empty**: `wri_wc_orders` = **0 rows** (also `wc_order_addresses`, `wc_order_operational_data`, etc. unused). HPOS is NOT enabled.
- Authoritative store = **`wri_posts` (post_type `shop_order`) + `wri_postmeta`** (classic CPT storage).

### Order status distribution (`post_status`)
| status | count |
|--------|------|
| wc-completed | 2398 |
| wc-pending | 27 |
| wc-failed | 17 |
| wc-cancelled | 7 |
| wc-refunded | 3 |
| wc-processing | 2 |
| **wc-subscription** | **2** |
| shop_order_refund (post_type) | 3 |

Related content types for migration context: `livres` 386 pub / 46 draft, `auteurs` 983 pub, `rencontres` 284 pub, `post` 1022 pub, `attachment` 767.

### Order postmeta model (key fields to preserve)
Identity/customer: `_customer_user` (WP user id, 0=guest), `_order_key` (`wc_order_...`), `_order_currency` (EUR), `_created_via` (`checkout`), `_customer_ip_address`, `_customer_user_agent`.
Billing: `_billing_first_name/last_name/company/address_1/address_2/city/postcode/state/country/email/phone`, `_billing_address_index`.
Shipping: `_shipping_*` (same set), `_shipping_address_index`.
Totals: `_order_total`, `_order_tax`, `_order_shipping`, `_order_shipping_tax`, `_cart_discount`, `_cart_discount_tax`, `_prices_include_tax` (`no`).
Lifecycle: `_date_paid` (unix), `_paid_date` (mysql), `_date_completed`/`_completed_date`, `_order_stock_reduced`, `_download_permissions_granted`, `_new_order_email_sent`, `_recorded_sales`, `_recorded_coupon_usage_counts`.
VAT: `is_vat_exempt` (`no`), `ws_opt_in`.
Attribution (WC order attribution): `_wc_order_attribution_source_type / utm_source / referrer / device_type / session_*` — marketing analytics, low migration priority.
Payment/Stripe: see §4.
Invoice (wcpdf): see §5.

---

## 3. Order line items — `wri_woocommerce_order_items` + `_itemmeta`

`wri_woocommerce_order_items`: 5182 rows → **3073 `line_item`** + **2109 `shipping`** (no `tax`/`fee`/`coupon` rows).

### line_item itemmeta keys
Standard WC: `_product_id` (24/664/4084), `_variation_id` (0, no variations), `_qty`, `_line_total`, `_line_subtotal`, `_line_tax` (0), `_line_subtotal_tax` (0), `_line_tax_data` (serialized empty), `_tax_class` (empty), `_name` (sometimes), `_reduced_stock` (rare — stock is not WC-managed).
**Custom (critical): `_id_livre`** = the `livres` post ID (the actual book), **`format`** = `papier|epub|souscription`.

### shipping itemmeta keys
`method_id` (**always `free_shipping`**), `instance_id`, `cost` (0), `total_tax` (0), `taxes` (serialized), `Articles` (human label e.g. `livre × 1`).

### Worked example — order 9332 (completed, 2026-07-03)
- line_item 5492: name→`Édition française, qui possède quoi`, `_id_livre=7715`, `_product_id=24`, `format=papier`, `_qty=1`, `_line_total=18`, tax 0.
- shipping 5493: `method_id=free_shipping`, `instance_id=2`, `cost=0`, `Articles="livre × 1"`.
- Order meta: `_order_total=18.00`, `_order_tax=0`, `_order_shipping=0`, currency EUR, `_payment_method=stripe_cc`, `_payment_method_title=Visa ********6416`, `_transaction_id=ch_3Tp4fN...` (Stripe charge), `_payment_intent_id=pi_3Tp4fN...`, `_payment_method_token=pm_1Tp4fL...`, `_stripe_fee=0.52`, `_stripe_net=17.48`, `_stripe_currency=EUR`, `_wc_stripe_charge_status=succeeded`, `_wc_stripe_mode=live`.

Books are always `_qty=1` per line, one `livres` per line (unique_key forces distinct lines).

---

## 4. Payment — Stripe (Payment Plugins), LIVE

Two Stripe plugins installed on disk: **`woo-stripe-payment`** (Payment Plugins for Stripe) and **`woocommerce-gateway-stripe`** (official). **The LIVE gateway is `woo-stripe-payment`** — order `_payment_method=stripe_cc` on 2334 orders (the Payment-Plugins gateway id). Official gateway (`stripe`) is not the one recording sales.

Option keys (Payment Plugins family): `woocommerce_stripe_api_settings`, `woocommerce_stripe_cc_settings`, plus per-method: `applepay`, `googlepay`, `payment_request`, `sepa`, `ach`, `affirm`, `afterpay`, `account`, `advanced`.
- `woocommerce_stripe_api_settings`: **`mode=live`**; contains both test and live publishable/secret keys (LIVE SECRETS PRESENT IN DB — treat as sensitive, rotate on migration; not reproduced here).
- `woocommerce_stripe_cc_settings`: `enabled=yes`, `charge_type=capture` (immediate capture), `save_card_enabled=no`, `force_3d_secure=no`, cards amex/visa/mastercard, `method_format=type_masked_number` (explains `_payment_method_title` = "Visa ********6416").

Stripe payment tokens: `wri_woocommerce_payment_tokens` / `_tokenmeta` (save-card is off, so likely minimal).

Per-order Stripe meta to preserve: `_transaction_id` (charge `ch_...`), `_payment_intent_id` (`pi_...`), `_payment_method_token` (`pm_...`), `_stripe_fee`, `_stripe_net`, `_stripe_currency`, `_wc_stripe_charge_status`, `_wc_stripe_mode`.

---

## 5. Taxes, shipping, coupons, invoicing

### Taxes — effectively NONE applied
`wri_woocommerce_tax_rates` = **0 rows**. Every order/line has tax = 0. Prices are TVA-incluse conceptually but no WC tax rate configured. `_prices_include_tax=no`, `_tax_class=''`.

### Shipping — free only
Two zones: **`France Métropolitaine`** (zone 2, matches FR + all metropolitan postcode wildcards `01*`…`2A*/2B*`…) and **`France`** (zone 3, country FR). Only method anywhere = **`free_shipping`**. Zone 2 free_shipping enabled; zone 3 free_shipping disabled. Settings: title `Livraison gratuite`, `min_amount=0`, no `requires`. All 2109 shipping lines are `free_shipping`, cost 0. (No DOM-TOM / international / paid shipping configured.)

### Coupons — none
`shop_coupon` posts = **0**. No coupon order-item rows. Discount fields all 0.

### Invoicing — `woocommerce-pdf-invoices-packing-slips` (barely used)
- Invoice numbering = **plain sequential integer**, `prefix=''`, `suffix=''`, `padding` none. `_wcpdf_invoice_number_data` = serialized array `{number, formatted_number, prefix:'', suffix:'', document_type:'invoice', order_id, padding:N}`.
- Only ~**15 invoices ever generated** (`wri_wcpdf_invoice_number` has 15 rows; latest numbers 9,10,11,13,14 across 2026). So the PDF invoice feature is essentially unused / on-demand, NOT one invoice per order. Custom invoice template overridden in theme: `themes/agone/woocommerce/pdf/SimpleAgone/invoice.php`.
- Options: `wpo_wcpdf_documents_settings_invoice`, `..._packing-slip`, `wpo_wcpdf_settings_general`.

---

## 6. The 2 `wc-subscription` orders — NOT a subscriptions plugin

**No WooCommerce Subscriptions plugin is installed** (not in plugins dir). The 2 `wc-subscription` posts (IDs 6276, 6383, dated Mar–Apr 2025) are orphan/legacy records — line items look like normal book lines (`_id_livre`, `_product_id=24` or `4084`, `_line_total=0`, one shows the `papioer` typo). They are **not recurring billing**.

"Souscription" in AGONE's sense = **pre-order / crowdfunding of a forthcoming title**, implemented as the generic product **4084 `livre (Souscription)`** + line `format=souscription` + price from the `livres` field `tarif_souscription`. 353 souscription line items exist across normal completed orders. **The rebuild does NOT need a recurring-subscription engine — it needs a "pre-order / souscription" product mode.**

---

## 7. `woocommerce-orders-ei` plugin (v5.6, "WooCommerce Orders & Customer exporter")

Export-only admin tool (author Lagudi Domenico) under WooCommerce menu → "Orders/Customers export". Declares HPOS compatibility, picks legacy vs HPOS model class at runtime (`1.0/` prefix when HPOS off — so it uses the legacy `WCOEI_Order`). Produces **CSV** exports of orders/customers. Config `wcoei_options`: `csv_separator=","`, `columns_to_export=[3,10,26,32,43,46,47,49,50,51]` (10 selected columns by internal index). No import logic wired (the `import` action case is empty). **Not part of the sales pipeline** — just a manual back-office CSV exporter; nothing to migrate beyond noting the staff workflow of exporting orders to CSV.

---

## 8. Data model to preserve for AGONE 2.0

For each **order** keep: id, status, created/paid/completed dates, currency, customer (user id or guest), full billing + shipping address blocks, totals (total/tax/shipping/discount), currency, Stripe refs (`pi_`, `ch_`, `pm_`, fee, net, charge_status, mode), invoice number (if any), attribution (optional).
For each **line**: the `livres` id (`_id_livre`), book title snapshot (`_name`/rendered), `format` (`papier|epub|souscription`), qty, unit/line price (`_line_total`), tax (0). Note the generic `_product_id` (24/664/4084) is only meaningful as a "physical vs ebook vs pre-order" flag — map it to `format`.
Catalog side: migrate `livres` CPT with `prix_papier`, `prix_digital`, `tarif_souscription`, `isbn_papier`, `isbn_digital`, `qte_stock`, `fichier_epub`. Books ARE the products in the new model — recommend first-class Book products with three price/format variants + own stock, replacing the generic-product + runtime-set_price hack.
Config to carry: single currency EUR, no tax rates, free shipping France only, Stripe live (capture immediately, no saved cards, no 3DS forced), sequential invoice numbering.

## Open questions / flags
- **Data quality**: `format` typos (`papioer`, `livre`) and 2 orphan `wc-subscription` orders need cleanup rules during migration.
- Stripe **live secret keys are stored in the DB in plaintext** — rotate during migration.
- `_id_livre` points to `livres` post IDs that may be trashed/deleted over time — need a fallback when a referenced book no longer exists (title snapshot on line item mitigates).
- Ebook fulfillment: product 664 is downloadable but the actual file is `livres.fichier_epub`; confirm how the download is delivered (WC downloadable permissions vs custom) before rebuild.
- Only ~15 PDF invoices exist for 2398 completed orders — confirm the legal/accounting invoicing expectation for 2.0 (per-order invoice numbering likely required for a real publisher).
