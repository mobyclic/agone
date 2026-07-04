# Discovery 06 — Rencontres & Editorial Content

Maps the non-shop editorial content types (events, blog, static pages, navigation, newsletter) so the AGONE 2.0 front can be rebuilt with equivalent content.

Source: production WordPress DB `[REDACTED-DB]`, prefix `wri_`. Read-only.
Date: 2026-07-04.

---

## 0. Post-type inventory (published)

| post_type | publish | draft/other |
|---|---|---|
| `post` (blog) | **1022** | 107 draft, 1 pending, 2 auto-draft |
| `auteurs` (CPT) | 983 | 3 draft, 6 trash |
| `livres` (CPT) | 386 | 46 draft |
| `rencontres` (CPT) | **284** | 5 draft, 2 trash |
| `page` | **20** | 1 draft |
| `nav_menu_item` | 24 | — |
| `product` (Woo) | 3 | — |
| `shop_order` | 2398 completed | (see shop discovery) |
| `wp_navigation` | 1 (block-theme nav, unused for classic menus) | — |

ACF is the metadata engine: 6 field groups, 42 `acf-field` rows, 3 `acf-post-type`, 1 `acf-taxonomy`.

---

## 1. `rencontres` CPT — the events / agenda (284 published)

The events calendar. Slug base is `/rencontres`. **The event description IS `post_content`** (HTML with inline `<a>` links to books/venues). Featured image via `_thumbnail_id`. Title = event title.

### ACF field group `group_651d6ccb3d365` — "Informations Rencontre" (parent post 521)

| Label | meta_key | ACF type | Return format | Notes |
|---|---|---|---|---|
| Date de début | `date_de_debut` | `date_time_picker` | `Y-m-d H:i:s` | Event start. Stored e.g. `2026-10-08 12:30:00` |
| Date de fin | `date_de_fin` | `date_time_picker` | `Y-m-d H:i:s` | Often empty (single-session events) |
| Lieu | `lieu` | **`google_map`** | serialized array (13 keys) | Venue — see structure below |
| Auteurs associés | `auteurs_associes` | `post_object` (multiple) | array of `auteurs` post IDs | Bidirectional ↔ author's `rencontres_associees` (`field_651d6c8f3f3ab`) |
| Livres associés | `livres_associes` | `post_object` (multiple) | array of `livres` post IDs | Bidirectional ↔ book's `rencontres_associes` (`field_651d847d9dff7`) |

Each key also has a shadow `_<key>` meta holding the ACF field key (e.g. `_lieu` = `field_651d84469dff6`). Underscore rows are ACF plumbing, not data.

**There is NO dedicated "external link", "ville", or "description" ACF field.** The city is inside the `lieu` google_map blob; external links live as inline HTML anchors inside `post_content`.

### `lieu` google_map serialized structure (PHP `serialize()`, 13 keys)

```
a:13:{
  s:"address"       => "La Carmagnole, Rue de la Palissade, Montpellier, France"
  s:"lat"           => 43.6074093     (double)
  s:"lng"           => 3.8679771      (double)
  s:"zoom"          => 14             (int)
  s:"place_id"      => "ChIJVVVxJKuvthIR06Nn3mMb8tU"  (Google Place ID)
  s:"name"          => "La Carmagnole"       (venue name)
  s:"street_number" => "10"
  s:"street_name"   => "Rue de la Palissade"
  s:"city"          => "Montpellier"
  s:"state"         => "Occitanie"
  s:"post_code"     => "34000"
  s:"country"       => "France"
  s:"country_short" => "FR"
}
```
Some rows omit `street_number` (venue only has street). Migration: parse this into structured venue fields `{ name, address, street, city, postCode, state, country, lat, lng, placeId }`.

### Volume split (relative to 2026-07-04)
Of 306 date-bearing `date_de_debut` values (incl. drafts): **15 upcoming**, **291 past**. So the front needs a "past events" archive plus an "à venir" list — the vast majority are historical.

### Also present (ignorable / migration noise)
- `sib_push_*` meta on every rencontre (Brevo push-notification plugin config, all defaults / disabled — `sib_push_target_segment_ids=@ALL`, `send_notification=0`).
- `_yoast_wpseo_*` SEO meta, `_dp_original` (Duplicate Post source ID), `_wp_old_date`.

### Sample events (published, newest)
| ID | Title | date_de_debut | venue (lieu.name / city) | authors | books |
|---|---|---|---|---|---|
| 9316 | "Vivre sans police…", discussion avec Victor Collet | 2026-07-02 19:00 | Librairie Lune et L'Autre / Saint-Étienne | 318 | 6308 |
| 9302 | Le livre, le cinéma et les médias dans la bataille culturelle | 2026-09-28 18:00 | La Carmagnole / Montpellier | 332 | 7715, 557 |
| 9298 | Science sans décroiscience… Nicolas Chevassus-au-Louis | 2026-09-25 19:00 | La Carmagnole / Montpellier | 1473 | 6310 |
| 9055 | La science face à l'urgence climatique… | 2026-10-08 12:30 | Univ. Montpellier Paul-Valéry / Montpellier | 1473 | 6310 |

---

## 2. `post` — blog / actualités (1022 published)

These are editorial **articles** ("Antichambre" section), NOT press releases. Titles frequently carry a `[LettrInfo 26-XVIII]` suffix = numbered "Lettre d'information" newsletter issues republished as posts. Standard `post_content` + `_thumbnail_id`.

### Categories (taxonomy `category`) — these are the editorial **rubriques**
Flat hierarchy (all `parent=0`). 7 active rubriques + 5 empty legacy "chronique" columns + Uncategorized.

| term_id | Name | slug | count |
|---|---|---|---|
| 20 | **Inactualités** | `inactualites` | 413 |
| 21 | **L'Ordre médiatique** | `lordre-mediatique` | 144 |
| 24 | **Tout le reste est littérature** | `tout-le-reste-est-litterature` | 139 |
| 23 | **Révolution sociale ou barbarie** | `revolution-sociale-ou-barbarie` | 137 |
| 22 | **Raison garder** | `raison-garder` | 97 |
| 18 | **À quoi sert l'École** | `a-quoi-sert-lecole` | 89 |
| 19 | Impérialismes | `imperialismes` | 3 |
| 1 | Uncategorized | `uncategorized` | 1 |
| 34 | Chronique d'Alain Accardo | `chronique-dalain-accardo` | 0 |
| 35 | La chronique de Jean-Pierre Garnier | `la-chronique-de-jean-pierre-garnier` | 0 |
| 36 | Chroniques européennes | `chroniques-europeennes` | 0 |
| 37 | Pour suivre JMarc Rouillan | `pour-suivre-jmarc-rouillan` | 0 |
| 38 | Chroniques américaines | `chroniques-americaines` | 0 |

No `post_tag` terms in use. A post typically has exactly one rubrique.

### ACF field group `group_651d84f0dc9b9` — "Informations Article" (parent post 526)
Posts (articles) link back to books and authors:

| Label | meta_key | type | Return | Bidirectional target |
|---|---|---|---|---|
| Auteurs associés | `auteurs_associes` | `post_object` multiple | author IDs | ↔ author `articles_associes` |
| Livres associés | `livres_associes` | `post_object` multiple | book IDs | ↔ book `articles_associes` (`field_651d850ee0dc2`) |

(The `livres` "Informations livre" group also has `articles_associes` + `rencontres_associes` reverse links, so books surface their related articles & events.)

### Sample posts
| ID | Title | date | rubrique |
|---|---|---|---|
| 9271 | Les bombes vues de dessous [LettrInfo 26-IX] | 2026-06-21 | Révolution sociale ou barbarie |
| 8643 | De la guerre comme politique étrangère des USA, 1846-2026 | 2026-06-18 | Impérialismes |
| 9264 | Un jugement qui met tous les enseignants… en danger | 2026-06-17 | À quoi sert l'École |
| 9220 | Le dur métier de force de l'ordre [LettrInfo 26-XVIII] | 2026-06-07 | Inactualités |

---

## 3. `page` — static pages (20 published, 1 draft)

| ID | Title | slug | status | Role |
|---|---|---|---|---|
| 2 | Accueil | `accueil` | publish | Homepage (classic) |
| 769 | homepage2 | `homepage2` | publish | Alt/dev homepage |
| 155 | à propos | `a-propos` | publish | About / la maison |
| 157 | contact | `contact` | publish | Contact |
| 3744 | Conditions générales de vente | `engagements` | publish | **CGV** (slug is `engagements`!) |
| 3 | Mentions légales | `mentions-legales` | publish | Legal notice |
| 10 | Refund and Returns Policy | `refund_returns` | **draft** | Woo default (unused) |
| 573 | livres | `livres` | publish | Catalogue landing |
| 576 | auteurs | `auteurs` | publish | Authors landing |
| 643 | à paraître | `a-paraitre` | publish | Forthcoming books |
| 645 | focus | `focus` | publish | Featured / spotlight |
| 21 | Antichambre | `antichambre` | publish | Blog landing (rubriques hub) |
| 743 | recherche | `recherche` | publish | Search results |
| 235 | test | `test` | publish | Dev scratch (ignore) |
| 6 | Shop | `shop` | publish | Woo shop |
| 7 | Mon panier | `mon-panier` | publish | Woo cart |
| 8 | Checkout | `checkout` | publish | Woo checkout |
| 9 | Mon Compte | `mon-compte` | publish | Woo my-account (parent of 717) |
| 717 | ma bibliothèque | `ma-bibliotheque` | publish | Child of 9 — user's e-book library |
| 5917 | adminagone | `adminagone` | publish | Admin/internal |
| 7908 | gestion | `gestion` | publish | Internal management |

Real front-facing static pages to rebuild: **à propos, contact, CGV (engagements), mentions légales, à paraître, focus**. The rest are Woo/system/dev pages. `ma bibliothèque` (child of Mon Compte) is the customer e-book download area.

---

## 4. Navigation — reconstructed sitemap

Three registered menus (taxonomy `nav_menu`): **menu principal** (15 items, the real primary), **menu mobile** (2), **menu mobile dialog** (7). Menu-item titles are empty when they inherit from the linked page/category. Resolved below.

### PRIMARY MENU ("menu principal", 15 items in order)

| # | item ID | Label (resolved) | Type | Target |
|---|---|---|---|---|
| 1 | 38 | **Antichambre** (rubriques dropdown parent) | post_type→page | page 21 `/antichambre` |
| 2 | 3426 | ↳ À quoi sert l'École | taxonomy | category 18 |
| 3 | 3427 | ↳ Impérialismes | taxonomy | category 19 |
| 4 | 3417 | ↳ Inactualités | taxonomy | category 20 |
| 5 | 3419 | ↳ L'Ordre médiatique | taxonomy | category 21 |
| 6 | 3425 | ↳ Raison garder | taxonomy | category 22 |
| 7 | 3424 | ↳ Révolution sociale ou barbarie | taxonomy | category 23 |
| 8 | 3418 | ↳ Tout le reste est littérature | taxonomy | category 24 |
| 9 | 39 | **Catalogue** | custom | `/livres` |
| 10 | 40 | **Auteurs** | custom | `/auteurs` |
| 11 | 41 | **Rencontres** | custom | `/rencontres` |
| 12 | 160 | **À propos** | post_type→page | page 155 `/a-propos` |
| 13 | 3749 | **Search** | custom | `#search-al` (JS search overlay) |
| 14 | 667 | Mon Compte | post_type→page | page 9 `/mon-compte` |
| 15 | 665 | Panier | post_type→page | page 7 `/mon-panier` |

Items 2–8 have `_menu_item_menu_item_parent = 38`, i.e. the 7 blog rubrique categories are a **dropdown under "Antichambre"**.

### Effective top-level nav for AGONE 2.0
```
Antichambre ▾   (blog hub; dropdown = 7 rubriques)
    ├ À quoi sert l'École
    ├ Impérialismes
    ├ Inactualités
    ├ L'Ordre médiatique
    ├ Raison garder
    ├ Révolution sociale ou barbarie
    └ Tout le reste est littérature
Catalogue        → /livres
Auteurs          → /auteurs
Rencontres       → /rencontres
À propos         → /a-propos
[Search]         → search overlay
[Compte]         → /mon-compte  (+ ma bibliothèque)
[Panier]         → /mon-panier
```
Footer targets (not in nav menus, link directly): CGV `/engagements`, Mentions légales `/mentions-legales`, Contact `/contact`, À paraître `/a-paraitre`, Focus `/focus`.

### Other menus
- **menu mobile** (2 items): 727→page 9 (Compte), 728→page 7 (Panier).
- **menu mobile dialog** (7 items): logo (custom `#`), Accueil (page 2), Antichambre (page 21), catalogue (page 573), auteurs (page 576), rencontres (custom `/rencontres`), à propos (page 155). This is the hamburger drawer.

---

## 5. Newsletter integration

Two plugins present; **Brevo (ex-Sendinblue) is the live one**, Mailjet is dormant.

### Brevo / Sendinblue (`sib` plugin — "Newsletter, SMTP, Email marketing tools by Brevo")
- Table `wri_sib_model_users`: **0 rows** — subscribers are NOT stored locally; they live in the Brevo cloud account. No exportable subscriber list in this DB.
- Table `wri_sib_model_forms`: **1 form** ("Default Form"). Fields: `email` (required) + `NAME` (text). Submits to **Brevo list ID 10** (`listID = a:1:{i:0;s:2:"10";}`), `templateID=-1`, `confirmID=-1` (no double-opt-in template configured).
- Per-post `sib_push_*` meta = Brevo push/notification add-on, all disabled.
- The `[LettrInfo NN]` blog posts are the archived issues of Agone's "Lettre d'information" newsletter (sent via Brevo, republished as `post`).

### Mailjet (`mailjet-for-wordpress`)
- Tables `wri_mailjet_wc_guests` (**0 rows**), `wri_mailjet_wc_abandoned_carts`, `wri_mailjet_wc_abandoned_cart_emails` — WooCommerce abandoned-cart / guest sync. Empty. Effectively unused / superseded by Brevo.

**Migration takeaway:** no subscriber data to migrate from DB. Rebuild = a simple email(+name) signup form posting to Brevo list 10 via Brevo API, plus SMTP transactional email through Brevo (the reference stack uses Resend — architect to decide keep Brevo vs. move to Resend).

---

## 6. Rebuild spec summary (content model)

- **Event** (`rencontres`): `title, slug, body(html), coverImage, startAt(datetime), endAt(datetime?), venue{name,address,street,city,postCode,state,country,lat,lng,placeId}, authors[]→Author, books[]→Book`. List = upcoming vs past split.
- **Article** (`post`): `title, slug, body(html), coverImage, publishedAt, rubrique(one of 7), authors[]→Author, books[]→Book`. Legacy empty "chronique" categories can be dropped.
- **Rubrique** taxonomy: 7 active terms (Inactualités, L'Ordre médiatique, Tout le reste est littérature, Révolution sociale ou barbarie, Raison garder, À quoi sert l'École, Impérialismes).
- **Static pages**: à propos, contact, CGV(`engagements`), mentions légales, à paraître, focus (+ homepage, search, account/bibliothèque).
- **Nav**: Antichambre(▾7 rubriques) · Catalogue · Auteurs · Rencontres · À propos · Search · Compte · Panier.
- **Newsletter**: Brevo list 10, email+name form; no local subscriber data.

## Open questions for the architect
1. Keep Brevo (transactional + newsletter list 10) or migrate to Resend per the reference stack? Subscriber list must be pulled from Brevo API, not the DB.
2. Homepage: two page candidates (`accueil` id 2, `homepage2` id 769) — likely bespoke templates. Confirm which is live and whether homepage is hand-built (out of scope for content model).
3. Venue google_map blob → do we keep lat/lng/placeId for map rendering, or store address only? 291/306 events are past — is a full historical events archive in scope, or only recent/upcoming?
4. `[LettrInfo NN]` posts double as newsletter issues — treat as normal articles or model a distinct "Lettre d'info" type?
