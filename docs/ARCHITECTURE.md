# AGONE 2.0 — Architecture

Proposed architecture for the full rebuild of `agone.org` on the FEEDSOURCING stack
(SvelteKit 5 runes + SurrealDB + Tailwind4/shadcn + R2 + Resend + Stripe).
Companion to `DISCOVERY-SUMMARY.md` (current system) and the nine `docs/discovery/` reports.

> **CORRECTION — Monolingue FR (décision actée, cf. `DECISIONS.md`).** Le site est en
> **français uniquement**. On NE reprend PAS la couche i18n de FEEDSOURCING. Partout où ce
> document mentionne `*_i18n = { fr, en }`, un `LanguageSwitcher`, `set-locale`, un cookie
> `ag_lang`, ou « bilingual chrome / EN strings » : **c'est supprimé**. Le contenu éditorial
> est stocké en **texte simple** (`description_html`, `bio_html`, `body_html`, `name`, …),
> l'UI est en français inline (pas de mécanisme de locale). `hooks.server.ts`, `app.d.ts`,
> `+layout.server.ts` ne portent pas de `locale`. La question ouverte #14 (i18n) est close.
> Rôles contributeurs étendus : `[author, editor, translator, preface, postface, illustrator, other]`.
> Canaux de vente `sales_report.channel` extensibles (aujourd'hui `web`/`bldd`/`manual`, d'autres à venir).

Design stance: **books are first-class products**, the **ISBN-13 is the spine** of the whole
system, the **contributor-role graph is modelled as real edges with share %** (so the
droits-d'auteur module is queryable), and the **Belles Lettres integration is ported with FTP
SEND disabled until production**.

Key decisions taken up front (see Open Questions for the ones still owed to Alistair):

- **Single-tenant.** AGONE is one publishing house. Drop FEEDSOURCING's `org` / `member_of` /
  `active_org` multi-company model entirely. `user` gains a `role` enum scoped to AGONE.
- **One-off commerce, not subscriptions.** Use Stripe **PaymentIntent / Checkout in payment
  mode**, not subscription mode. Keep `stripe.ts` but bill orders, not plans. `billing.ts`
  and the `plan`/`subscription` tables are dropped.
- **Book = one record; paper / ebook / souscription are variants** (fields on the book, not
  separate rows). An order line references `book` + `format`.
- **BLDD stays the stock authority and the fulfilment channel** for paper, ported as two
  jobs. Direct web orders for paper are still exported to BLDD as EDI.
- **Roles** (`user.role`): `admin` (staff, full back-office), `editor` (catalogue/content
  staff), `customer` (public buyer), `pending` (unverified). Guards: `requireStaff` =
  admin|editor; `requireAdmin` = admin; `requireUser` = any logged-in.

---

## 1. SurrealDB data model

Conventions inherited verbatim from FEEDSOURCING (report 09): `SCHEMAFULL`, `DEFINE …
OVERWRITE` (idempotent), `option<>` for back-compat, `*_i18n = object {fr,en}` for editorial
content, `created_at`/`updated_at` via `time::now()`, `ana_text`/`ana_prefix` analyzers, BM25
full-text indexes, enum idiom `TYPE string ASSERT $value IN [...]`. App connects as **root**;
all authz in the app layer. Edges: `DEFINE TABLE OVERWRITE <edge> TYPE RELATION IN <a> OUT
<b> SCHEMAFULL` + a `UNIQUE` index on `(in, out[, role])`.

### 1.1 Auth core (COPY-VERBATIM from FEEDSOURCING, then adapt `user.role`)

`media`, `user`, `session`, `magic_link`, `email_otp`, `password_reset`, `site_setting`.
`user` is adapted: drop `active_org`/`orgs`; `role` enum → `[admin, editor, customer,
pending]` DEFAULT `pending`; add `stripe_customer_id`, billing/shipping address objects,
`accepts_newsletter`, `unsubscribe_token`. Customer = a `user` with role `customer`.

### 1.2 Catalogue

```
book                        # the AGONE catalogue (was `livres` CPT)
  title, slug (UNIQUE), subtitle
  title_original, title_alt, language_original
  description_i18n? { fr, en }        # today FR only; body HTML → store as html string
  extra_info_html                     # infos_additionnelles
  status        ASSERT IN [draft, published, forthcoming, out_of_print] DEFAULT draft
  isbn_paper    (string, UNIQUE)      # EAN-13 — THE spine key
  isbn_ebook    (string)              # EAN-13 of the ebook
  price_paper         decimal (€ TTC) # prix_papier
  price_ebook         decimal         # prix_digital (NONE ⇒ no ebook)
  subscription_price  decimal         # tarif_souscription
  subscription_end    datetime        # date_souscription (release gate for BL)
  published_at        datetime        # date_de_publication
  published_original  datetime
  page_count          int
  width_cm, height_cm decimal         # physical dims (replace format enum)
  stock_qty           int DEFAULT 0   # authoritative = BLDD sync
  stock_synced_at     datetime
  featured            bool            # focus flag
  cover               record<media>
  ebook_asset         record<ebook_asset>   # see 1.4
  collections[]       record<collection>    # denormalized for query; edges too (below)
  rubriques[]         record<rubrique>
  vat_rate            decimal DEFAULT 5.5    # French book VAT
  legacy_wp_id        int          # migration mapping (livres post ID) — indexed
  timestamps

collection                  # publisher collections (taxonomy `collection`)
  name, slug (UNIQUE), description_i18n, sort, legacy_term_id
rubrique                    # book/blog themes (taxonomy `category`), split book vs blog use
  name, slug (UNIQUE), kind ASSERT IN [book, blog, both], legacy_term_id
series                      # NEW: multi-volume works (Rosa Luxemburg OC) — optional
  name, slug
```

Full-text: `ft_book_title` (BM25 on title+subtitle). Indexes: `isbn_paper` UNIQUE,
`legacy_wp_id`, `slug`.

### 1.3 Authors & contributor-role graph (droits-d'auteur foundation)

The single most important modelling change vs WordPress: **role + share% live on the edge**,
not in five parallel arrays.

```
author                      # was `auteurs` CPT
  first_name, last_name, full_name (VALUE string::concat)
  slug (UNIQUE)
  bio_i18n? / bio_html
  portrait      record<media>      # NEW (none today)
  hidden        bool               # hide_on_list
  nationality?, birth_year?, death_year?, website?   # NEW optional
  # fiscal identity for royalty payments (NEW, sensitive):
  legal_name?, siret?, agessa_urssaf?, iban_last4?, address?
  legacy_wp_id  int
  timestamps

# EDGE — replaces the 5 ACF role fields + adds share/order:
book ->contributed_by-> author
  role   ASSERT IN [author, translator, preface, postface, other] DEFAULT author
  share  decimal DEFAULT 100        # % of the role's royalty pool for this contributor
  position int DEFAULT 0            # co-author ordering
  UNIQUE (in, out, role)
```

Migration maps: `livre_auteurs`→role `author`, `livre_traducteurs`→`translator`,
`livre_auteurs_preface`→`preface`, `livre_auteurs_postface`→`postface`,
`livre_auteurs_divers`→`other`. Default `share` = 100 / N co-authors of that role (flagged
for editorial review — real splits come from contracts).

### 1.4 Ebooks & library

```
ebook_asset                 # the .epub in R2 (was fichier_epub attachment)
  book        record<book>
  format      ASSERT IN [epub, pdf] DEFAULT epub
  r2_key      string                # ebooks/<isbn_ebook>.epub  (private bucket)
  filename    string                # original display name
  size        int, content_type
  status      ASSERT IN [available, announced_no_file]   # reconciles 402-vs-191 gap

# EDGE — entitlement (was agone_mabibliotheque):
user ->owns-> ebook_asset
  order     record<order>
  format    string
  acquired_at datetime DEFAULT time::now()
  UNIQUE (in, out)

download_log                # replaces never-used wc_download_log (optional)
  user, ebook_asset, at, ip
```

### 1.5 Commerce

```
order                       # was shop_order posts (HPOS empty; legacy authoritative)
  number        int UNIQUE          # sequential, drives invoice + BL order ref X%07d
  customer      record<user>        # NONE only for legacy guest imports (id_user=0)
  status        ASSERT IN [pending, paid, processing, sent_to_bl, completed,
                           cancelled, refunded, failed] DEFAULT pending
  currency      DEFAULT 'EUR'
  billing       object { first_name,last_name,company,address_1,address_2,
                         postcode,city,state,country,email,phone }
  shipping      object { …same… }
  total, tax_total DEFAULT 0, shipping_total DEFAULT 0, discount_total DEFAULT 0
  # Stripe refs:
  stripe_payment_intent, stripe_charge_id, stripe_payment_method_title,
  stripe_fee, stripe_net, stripe_mode
  invoice_number int?               # per-order sequential in 2.0 (see decisions)
  # BL fulfilment tracking (replaces WC status-transition dedup):
  bl_export_file string?, bl_exported_at datetime?
  paid_at, completed_at, created_at datetime
  legacy_wp_id int

# EDGE — one per book line:
order ->contains-> book
  format   ASSERT IN [papier, epub, souscription]
  qty      int DEFAULT 1
  unit_price decimal                # snapshot at purchase
  line_total decimal
  title_snapshot string             # survives book deletion
  isbn_snapshot string
  # for souscription lines held for BL until release:
  bl_release_at datetime?
```

Order `number` and `invoice_number` are allocated from a `site_setting` counter (atomic
`UPDATE` returning the new value). No coupons, no tax rate applied (prices are TTC; store
`vat_rate` for accounting/reddition only). Shipping = free, metro-FR only (validated at
checkout).

### 1.6 Stock & distributor

```
distributor                 # BLDD (single row today; table allows future channels)
  name 'Les Belles Lettres', gln '3052325760012', code 'BLDD'
  extranet_url, ftp_host (secrets in env, not here)

stock_movement              # audit of each BLDD stock sync (optional but recommended)
  book, isbn, old_qty, new_qty, delta, source 'bldd', synced_at

bl_export                   # one per generated EDI file (was sent/ folder)
  filename 'CDAGO{YmdHis}.txt', body_bytes, order_count, book_count
  status ASSERT IN [staged, uploaded, failed] DEFAULT staged   # 'uploaded' only in prod
  created_at, uploaded_at
```

### 1.7 Droits d'auteur (royalties) — the new module, modelled explicitly

```
royalty_contract            # per book × contributor (× role) contract
  book       record<book>
  author     record<author>
  role       ASSERT IN [author, translator, preface, postface, other]
  # rate model: tiered by cumulative units sold
  tiers      array<object { up_to int?, rate decimal }>   # e.g. [{up_to:2000,rate:8},{rate:10}]
  scope      ASSERT IN [paper, ebook, all] DEFAULT all    # different % paper vs ebook
  base       ASSERT IN [ttc, ht, net_receipts] DEFAULT ht # % of price HT is typical FR
  advance    decimal DEFAULT 0        # à-valoir / avance
  advance_recouped decimal DEFAULT 0  # running recoupment
  min_guarantee decimal?
  signed_at, term_start, term_end datetime?
  document   record<media>            # scanned contract PDF
  status     ASSERT IN [draft, active, ended] DEFAULT draft
  timestamps

sales_report                # a period of units-sold per title, from any channel
  channel    ASSERT IN [web, bldd, manual]
  period_start, period_end datetime
  source_file record<media>?          # the BLDD reddition file imported
  imported_at datetime
sales_line                  # one book × period × channel row (feeds royalty calc)
  report     record<sales_report>
  book       record<book>
  isbn       string                   # join key (survives book id churn)
  format     ASSERT IN [paper, ebook, souscription]
  units_sold int
  units_returned int DEFAULT 0        # returns net off royalties
  units_free  int DEFAULT 0           # SP / service de presse (no royalty)
  gross_price decimal                 # unit price basis
  # web sales_lines are DERIVED from order->contains; bldd from imported reports

royalty_statement           # reddition de comptes: one per author per period
  author, period_start, period_end
  status ASSERT IN [draft, issued, paid]
  lines  array<object { book, role, units, base_amount, rate, share, gross, advance_applied, net }>
  advance_applied, total_due decimal
  issued_at, paid_at, document record<media>
```

Royalty computation (a `src/lib/server/droits.ts` function, not stored logic): for each
`royalty_contract`, gather `sales_line`s for its book/scope over the period, resolve the tier
by cumulative units, compute `units × base_price × rate% × contributor_share%`, subtract
returns, apply `advance` recoupment, and roll into a `royalty_statement`. This is the join the
discovery flagged as missing: **catalogue (ISBN) × web orders × BLDD reports × contract %**.

### 1.8 Editorial content

```
event                       # was `rencontres` CPT
  title, slug, body_html, cover record<media>
  start_at datetime, end_at datetime?
  venue object { name,address,street,city,post_code,state,country,lat,lng,place_id }
  authors[] record<author>, books[] record<book>    # + edges if traversal wanted
  legacy_wp_id
article                     # was `post` (Antichambre)
  title, slug, body_html, cover record<media>, published_at datetime
  rubrique record<rubrique>            # one of the 7 (kind=blog)
  is_newsletter_issue bool             # [LettrInfo NN] tagging
  authors[] record<author>, books[] record<book>
  legacy_wp_id
page                        # static pages (à propos, contact, CGV, mentions, à paraître, focus)
  title, slug (UNIQUE), body_html_i18n?, status
newsletter_subscriber       # local mirror; still push to Brevo/Resend
  email UNIQUE, name?, confirmed, unsubscribe_token, source, created_at
contact_message             # /contact form → Resend + stored
media                       # (auth core) covers, portraits, docs, epub thumbnails
```

RELATE edges to add where graph traversal beats arrays: `book->in_collection->collection`,
`book->has_rubrique->rubrique`, `event->features->(author|book)`,
`article->references->(author|book)`, `book->related_to->book`. Denormalized arrays kept on
the node for cheap list rendering; edges for authoritative queries (e.g. "all books by
author X across all roles").

---

## 2. Module & route map

Mirrors FEEDSOURCING conventions: public `src/routes/<module>/`, account `src/routes/compte/`
(guard `requireUser`), back-office `src/routes/admin/` (guard `requireStaff`). One server
module `src/lib/server/<module>.ts` + one i18n namespace `src/lib/i18n/ns/<module>.ts` each.
French slugs throughout (public-facing), with EN i18n strings.

### 2.1 Public

| Route | Module | Notes |
|---|---|---|
| `/` | `home` | à la une, focus, à paraître, Antichambre teaser, rencontres à venir |
| `/catalogue` | `catalogue` | hub + **faceted filters** (collection, rubrique, author, format, price, availability, year) + sort |
| `/collections/[slug]` | `catalogue` | collection listing + description |
| `/livre/[slug]` | `book` | full book page; add-to-cart (paper/ebook/souscription); related books/articles/events |
| `/auteurs` + `/auteur/[slug]` | `author` | alpha-indexed list; enriched author page (portrait+bio+full biblio by role) |
| `/rencontres` + `/rencontres/[slug]` | `events` | **server-rendered**; à venir / passées toggle; map + ICS export |
| `/antichambre` + `/antichambre/[rubrique]` | `articles` | magazine hub + rubrique archives |
| `/article/[slug]` | `articles` | single article |
| `/a-propos` `/contact` `/engagements` `/mentions-legales` `/a-paraitre` `/focus` | `pages` | static/editorial |
| `/recherche` | `search` | unified: books + authors + articles + events |
| `/panier` | `cart` | cart (server-side session cart) |
| `/checkout` | `checkout` | address + Stripe payment; forces account for ebook lines |
| `/commande/[number]` | `checkout` | confirmation / receipt |

### 2.2 Account — `/compte` (`requireUser`)

`DashboardShell` sidebar. Pages: **bibliothèque** (owned ebooks → signed-URL download),
**commandes** (order history + invoices), **profil** (identity, addresses, password,
newsletter). Uses `compte` module + `library` server module.

### 2.3 Back-office — `/admin` (`requireStaff`)

`DashboardShell` sidebar. Sections:

- **catalogue** — CRUD books (all fields, cover upload, ebook upload, collections/rubriques,
  contributors with role+share editor).
- **auteurs** — CRUD authors (portrait, bio, fiscal identity), see their books-by-role.
- **stock** — view stock, trigger/monitor BLDD stock sync, `stock_movement` history.
- **commandes** — order management, status, refunds, invoice generation.
- **droits d'auteur** — contracts CRUD, import BLDD sales reports, compute & issue
  `royalty_statement`s, track advances/recoupment. (`requireAdmin`.)
- **expéditions BL** — BL export queue, generated EDI files (`bl_export`), **dry-run
  download** of `tosend/` equivalent; upload button gated to production.
- **contenu** — articles, events, static pages, newsletter, contact messages.
- **paramètres** — `site_setting` (banner, counters, VAT), users/roles.

### 2.4 Server modules (`src/lib/server/`)

Reuse verbatim: `surreal, media, slug, site, stripe, auth/*`. Adapt: `mail, storage,
account, access, auth/session`. **Write fresh:** `catalogue.ts, book.ts, author.ts,
cart.ts, checkout.ts, order.ts, library.ts, ebook.ts, events.ts, articles.ts, pages.ts,
search.ts, stock.ts, belleslettres.ts, droits.ts, newsletter.ts, invoice.ts`.

---

## 3. Integrations plan

### 3.1 Stripe (payment mode)
`stripe.ts` verbatim but call `checkout.sessions.create({ mode: 'payment', line_items })`
(add a `createPaymentCheckout` alongside the existing subscription helper, or branch it).
`/api/stripe/webhook` verbatim; `handleWebhookEvent` rewritten to handle
`checkout.session.completed` / `payment_intent.succeeded` → mark `order` paid, snapshot
Stripe refs, create `owns` edges for ebook lines, set status → `processing` (paper) so the BL
job picks it up. Immediate capture, no saved cards, no forced 3DS (match today). **Rotate the
live keys**; store in `STRIPE_SECRET_KEY` env only.

### 3.2 R2 (covers + ebooks)
`storage.ts` adapted with AGONE key conventions:
- Covers: `covers/<isbn_paper>.webp` (public bucket) — migrate the 347 `couvertures/` +
  zips, keyed by EAN-13; optimize to webp via existing `optimizeImage()`.
- Ebooks: `ebooks/<isbn_ebook>.epub` (**private** bucket, no public read). Download only via
  a server endpoint that checks the `owns` edge then issues a short-lived signed URL. Kills
  the `download.php` ownership/traversal/public-file bugs at once.

### 3.3 Resend (mail)
`mail.ts` adapted: AGONE brand layout, `sendLoginEmail` (OTP + magic link) reused,
order-confirmation + invoice + royalty-statement builders written fresh. **Newsletter
decision (see Open Q):** recommend keeping Brevo list 10 as the marketing list via its API
(subscribers only live there), while transactional mail moves to Resend. `MAIL_DRY_RUN`
honoured in non-prod.

### 3.4 Belles Lettres port (`src/lib/server/belleslettres.ts`)
Two functions, run as cron via `POST /api/cron/bl-stock` and `/api/cron/bl-orders` guarded by
`CRON_SECRET`:

- **Stock import** (`syncBldStock`): re-implement the authenticated BLDD flow (POST login →
  keep ASP session cookie → GET `stocks.asp?…&com=excel` → parse HTML table cols 0/1/3/18),
  join by EAN to `book.isbn_paper`, **overwrite** `stock_qty` (absolute), write
  `stock_movement` rows, email diff report via Resend. *Preferred: ask BLDD for an official
  feed; keep the scrape as fallback.* Reads BLDD creds from env (rotated).
- **Order export** (`exportBlOrders`): byte-exact fixed-width EDI builder — A(225)+B(204)+
  C(20) records, CRLF, ASCII//TRANSLIT, EAN/qty zero-pad-left, text space-pad+truncate.
  Constants: GLN `3052325760012`, ref `X`+7-digit number, poster EAN `9782748906035`,
  colisage `AGOCOLCOL`/`AGOLETLTR`/`AGOBROBRO`, FR→`100`. Two-pass selection (paid/processing
  orders + parked souscription lines released when `subscription_end`==today). Dedup via
  `order.status` transitions applied **only after successful upload** (same safety as today).

  **SAFEGUARD — FTP SEND DISABLED UNTIL PRODUCTION.** Behind an env flag
  `BL_FTP_ENABLED` (default `false`). When false: write the EDI file to a local `tosend/`
  equivalent and persist a `bl_export` row with `status='staged'`, log it, and **do NOT**
  connect to FTP or flip any order status. Only when `BL_FTP_ENABLED=true` (prod) does it
  upload to `[REDACTED-FTP-HOST]` (rotated creds), archive to `sent/`, set `status='uploaded'`, and
  transition orders. This makes every pre-prod run a pure dry-run.

Resolve the latent bug (mixed paper + not-yet-due souscription order): in 2.0 emit paper
lines and keep only the souscription line parked, rather than parking the whole order.

---

## 4. Migration strategy (WordPress/WooCommerce → SurrealDB)

Approach: **idempotent ETL scripts under `scripts/migrate-*.ts`**, run against a read-only
copy of the MySQL DB, each keyed so re-runs upsert. **Every migrated node carries
`legacy_wp_id`** (indexed) as the mapping key; a `migration_map` scratch table (or in-memory
maps persisted to JSON) records `wp_type:wp_id → surreal record`.

Order of import (respecting FK-like dependencies):

1. **Media/covers** → R2. Prefer `couvertures/<EAN13>` set (clean ISBN naming); fall back to
   WP featured image for books missing there; backfill the 5 cover-less books manually.
   Create `media` rows.
2. **Authors** (`auteurs` → `author`), keep `legacy_wp_id`. No photos exist (portrait later).
3. **Collections / rubriques** (taxonomies). Split shared `category` into `rubrique(kind)` —
   book-terms vs blog-terms.
4. **Books** (`livres` → `book`) with all ACF fields; link cover, collections, rubriques.
   Set `status` from `post_status` + `date_de_publication` (future ⇒ forthcoming).
5. **Contributor edges** — expand the 5 ACF role arrays into `contributed_by` edges with
   `role`, default `share`, `position`. Flag multi-author books for share review.
6. **Ebook assets** — move the 191 `.epub` to private R2 keyed by `isbn_ebook`; create
   `ebook_asset`. Reconcile the 402-vs-191 gap: missing file ⇒ `status='announced_no_file'`.
7. **Customers** (WP users who placed orders) → `user` role `customer`, keyed by email
   (dedup). Guest orders (`_customer_user=0`) → order with `customer=NONE` + billing email;
   **attempt retro-match ebook guest purchases by email** to grant a library.
8. **Orders** (`shop_order` legacy posts → `order`) with billing/shipping, totals, Stripe
   refs, status mapping (`wc-completed`→completed, `wc-processing`→processing, orphan
   `wc-subscription`→completed or per review). Lines from `order_items` (`_id_livre`→book via
   `legacy_wp_id`, `format` normalized — fix `papioer`/`livre` typos), with title/ISBN
   snapshots. Allocate 2.0 `number` = existing WC order number to preserve BL refs.
9. **Ebook entitlements** (`agone_mabibliotheque` 253 rows → `owns` edges), map user+book+
   order by `legacy_wp_id`.
10. **Events / articles / pages** (`rencontres`/`post`/`page`) → `event`/`article`/`page`;
    parse the `lieu` google_map blob into structured `venue`; map rubrique; set
    `is_newsletter_issue` on `[LettrInfo]` titles.
11. **Newsletter**: pull subscriber list from **Brevo API** (not in DB) into
    `newsletter_subscriber` if keeping/migrating; otherwise leave in Brevo.

**Out of scope for automated import / sourced separately:** royalty contracts, advances,
print runs, BLDD historical distribution sales, pre-2024 sales from the old PostgreSQL Oscar
DB (optional later mining — needs explicit go-ahead and a pg export). Slugs are **normalized**
during migration (NFD ascii `slugify`, collision loop) — old slugs kept in a
`legacy_slug`/redirect map so `/livre/{oldslug}` 301s to the new one.

---

## 5. Phased roadmap

### Phase 0 — Bootstrap (scaffold + schema + auth + shell)
File-by-file, derived from report 09's "Minimal bootable AGONE":

**Copy-verbatim:** `svelte.config.js`, `vite.config.ts`, `tsconfig.json`,
`src/routes/+layout.server.ts`, `src/lib/server/surreal.ts`, `media.ts`, `slug.ts`,
`site.ts`, `stripe.ts`, `auth/{password,magic,otp}.ts`, `src/routes/api/upload/+server.ts`,
`api/stripe/webhook/+server.ts`, `deconnexion/+server.ts`, `src/lib/utils.ts`, `toasts.ts`,
`ImageUpload.svelte`, `DashboardShell.svelte`, `ui/*`, `scripts/apply-schema.ts`,
`db-export.ts`, `db-import-cloud.ts`.

**Copy-adapt:** `package.json` (name `agone`, drop leaflet?/anthropic per Open Q, drop
`billing`), `components.json`, `.gitignore`, `.env.example` (rename brand vars, add
`BL_*`/`BREVO_API_KEY`), `src/app.html` (favicon, `lang="fr"`, theme-color `#d4211c`),
`src/app.d.ts` (user shape: drop orgs, role enum), `src/routes/+layout.svelte`,
`+error.svelte`, `hooks.server.ts` (**cookie `ag_session`**), `mail.ts` (AGONE brand),
`storage.ts` (covers/ebooks key helpers), `account.ts` (roles, drop org helpers),
`access.ts` (`requireStaff`/`requireAdmin`/`requireUser`), `auth/session.ts` (cookie name,
drop org projection), `src/lib/i18n/index.ts` (**cookie `ag_lang`**), `i18n/ns/common.ts`
(AGONE chrome), `app.css` (**palette: brand red `#d4211c`, black sections, blue `#26425b`;
add readable body font**), `Icon.svelte`, `PublicHeader.svelte` (AGONE nav),
`PublicFooter.svelte` (social Mastodon/FB/Insta, legal links, newsletter), `nav.ts`,
`set-locale/+server.ts`, `connexion` + `inscription` + `magic/[token]` routes,
`schema.surql` (auth tables verbatim + AGONE domain), `scripts/seed.ts` (admin
`alistair.marca@gmail.com`, collections/rubriques referentials).

**Write-fresh:** `Logo.svelte` (AGONE wordmark), `src/routes/+page.svelte` (placeholder
home), `src/routes/admin/+layout.{server,svelte}` + one admin page (proves guarded shell).

**Boot:** `bun install` → fill `.env` (cloud SurrealDB) → `bun run schema` → `bun run seed` →
`bun run dev` → sign in → `/admin`. `bun run check` at 0 errors.

### Phase 1 — Catalogue + authors (public, read-only)
Books, authors, collections, rubriques schema + migration (steps 1–5). Public routes
`/catalogue`, `/livre/[slug]`, `/auteurs`, `/auteur/[slug]`, `/collections/[slug]`, with
faceted filters + unified search. Enriched author pages. Admin catalogue + auteurs CRUD.

### Phase 2 — Shop + checkout + ebook library
Cart, Stripe payment-mode checkout, order confirmation, invoices. Order + entitlement schema;
migrate orders + `owns` edges (steps 7–9). `/compte` (bibliothèque with signed-URL ebook
downloads, commandes, profil). Force accounts for ebook purchases. R2 private ebook bucket.

### Phase 3 — Back-office + Belles Lettres
Admin stock, commandes, contenu (articles/events/pages — migration steps 10–11, server-
rendered events with map/ICS), paramètres. BLDD stock import + order export
(`belleslettres.ts`) with **FTP SEND disabled** (`BL_FTP_ENABLED=false`, dry-run to
`tosend/` + `bl_export` rows). Newsletter (Brevo/Resend decision).

### Phase 4 — Droits d'auteur
`royalty_contract`, `sales_report`/`sales_line`, `royalty_statement` schema. Admin contracts
CRUD, BLDD sales-report import, statement computation (`droits.ts`), advances/recoupment,
reddition-de-comptes PDF. Author fiscal identity fields. This phase depends on business
inputs (contract %s, BLDD report format) — see Open Questions.

---

## 6. Open questions / decisions for Alistair

**Blocking Phase 4 (droits d'auteur):**
1. **BLDD sales reporting** — in what format does Les Belles Lettres send sales/returns
   (reddition)? CSV / XLS / EDI / portal? Can we get a sample file? Royalties are impossible
   without distribution units; the web shop is a minority of volume.
2. **Contract model** — where do current royalty %s live (spreadsheets/paper)? Confirm the
   real model: flat vs tiered-by-tirage, % of PPHT vs TTC vs net receipts, different rate for
   paper/ebook/poche, per-role rates. My schema assumes tiered % of HT with per-role, per-
   scope contracts — confirm.
3. **Co-author splits** — equal split by default, or always contract-defined? (Migration
   defaults to equal + review flag.)
4. **Print runs (tirages)** — do royalties need them, and where do they live (Agone
   accounting)? Not in any current system.
5. **Author payment identity** — is there an existing supplier/author ledger (accounting
   software) we should read, or do we re-enter IBAN/SIRET/AGESSA in AGONE?
6. **Pre-2024 sales** — mine the old PostgreSQL Oscar DB for history (needs a pg export +
   explicit approval), or start royalty statements fresh from 2.0?

**Product/scope:**
7. **Newsletter** — keep Brevo (list 10, subscribers only in their cloud) for marketing and
   Resend for transactional, or fully migrate to Resend (requires a Brevo API subscriber
   export)? Recommendation: Brevo for the list, Resend for transactional.
8. **Antichambre (1022 articles)** — full migration and ongoing magazine, or freeze/archive?
   It's a large distinct pillar. Assumed in-scope.
9. **Historical events** — migrate all 291 past `rencontres` or only recent/upcoming?
10. **Souscription semantics** — do souscription sales count toward royalties at full or
    subscription price, and at order date or publication date?
11. **Invoicing** — 2.0 should issue a numbered invoice per order (only ~15 exist today).
    Confirm legal numbering scheme (prefix/format, reset yearly?).
12. **Format enum** — keep pure cm dimensions (no broché/poche enum) as today, or add an
    explicit binding/format field? (Schema currently: dimensions + derived ebook/souscription
    availability.)
13. **Series** — model multi-volume works (Rosa Luxemburg OC) as a first-class `series`, or
    keep riding on `collection`? (Schema includes an optional `series` table.)
14. **i18n scope** — content is FR-only today; do we author EN too, or ship FR with the i18n
    machinery ready but empty EN? (Assumed FR content, bilingual chrome.)
15. **Deps prune** — drop Leaflet (events map wants it back — keep?) and Anthropic AI SDK
    from `package.json`? Recommendation: keep Leaflet for the events map, drop Anthropic.
16. **Stock authority** — keep BLDD as stock source (scrape or official feed?), or move stock
    in-house? Recommendation: BLDD authority, push for an official feed, scrape as fallback.
