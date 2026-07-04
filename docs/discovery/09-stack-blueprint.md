# 09 — Stack Blueprint (AGONE 2.0)

Exact scaffolding blueprint derived from the FEEDSOURCING reference repo
(`/home/alistair/PROJETS/FEEDSOURCING`). This document is the copy/adapt recipe
to bootstrap AGONE 2.0 on an identical skeleton: **SvelteKit 2 + Svelte 5 runes,
adapter-node, SurrealDB cloud over HTTP, Tailwind v4 + shadcn-svelte, Cloudflare
R2, Resend, Stripe, bun**.

Convention used below:
- **COPY-VERBATIM** = copy the file byte-for-byte, no change needed.
- **COPY-ADAPT** = copy then change branding / table names / env prefixes.
- **WRITE-FRESH** = AGONE-specific, do not copy (write from AGONE's own domain).

---

## 1. Root config files

### `package.json` (COPY-ADAPT — change `name`, prune deps)
Type `module`, private. Scripts (copy verbatim, they are project-agnostic):
```json
"scripts": {
  "dev": "vite dev",
  "dev:clean": "fuser -k 5173/tcp 5174/tcp 2>/dev/null; sleep 0.5 && vite dev",
  "build": "vite build",
  "start": "BODY_SIZE_LIMIT=${BODY_SIZE_LIMIT:-100M} node build/index.js",
  "preview": "vite preview",
  "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
  "check:watch": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch",
  "db:start": "surreal start --user root --pass root --bind 127.0.0.1:8000 rocksdb://.surrealdata",
  "db:export": "bun run scripts/db-export.ts",
  "db:export:schema": "bun run scripts/db-export.ts --only-schemas",
  "db:import:cloud": "bun run scripts/db-import-cloud.ts",
  "schema": "bun run scripts/apply-schema.ts",
  "seed": "bun run scripts/seed.ts"
}
```
**devDependencies** (Svelte 5 / Kit 2 / Tailwind 4 stack — copy as-is, versions pinned):
`@sveltejs/adapter-node ^5.5.4`, `@sveltejs/kit ^2.61.1`, `@sveltejs/vite-plugin-svelte ^7.1.2`,
`svelte ^5.55.9`, `svelte-check ^4.4.8`, `typescript ^6.0.3`, `vite ^8.0.14`,
`tailwindcss ^4.3.0`, `@tailwindcss/vite ^4.3.0`, `@tailwindcss/postcss ^4.3.0`,
`tw-animate-css ^1.4.0`, `shadcn-svelte ^1.3.0`, `phosphor-svelte ^3.1.0`,
`@lucide/svelte ^1.16.0`, `@fontsource-variable/roboto ^5.2.10`,
`@internationalized/date ^3.12.1`, `dotenv ^17.4.2`, `@types/node ^26.1.0`.
(Drop `@types/leaflet` unless AGONE needs maps.)
**dependencies** (runtime — keep the subset AGONE uses):
`surrealdb ^2.0.3` (**required**), `bits-ui ^2.18.1`, `clsx ^2.1.1`,
`tailwind-merge ^3.6.0`, `tailwind-variants ^3.2.2`, `svelte-sonner ^1.1.1`,
`zod ^4.4.3` (all **required for the skeleton**);
`resend ^6.12.4` (mail), `@aws-sdk/client-s3 ^3.1063.0` + `@aws-sdk/lib-storage` + `sharp ^0.34.5` (R2 uploads),
`stripe ^19.1.0` (billing). Optional/domain: `leaflet`, `@anthropic-ai/sdk`, `unpdf` — **drop unless AGONE needs them**.

### `svelte.config.js` (COPY-VERBATIM)
```js
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
const config = { preprocess: vitePreprocess(), kit: { adapter: adapter({ out: 'build' }) } };
export default config;
```

### `vite.config.ts` (COPY-VERBATIM — the svelte-sonner SSR workaround matters)
```ts
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  optimizeDeps: { include: ['svelte-sonner', 'runed'] },
  ssr: { noExternal: ['svelte-sonner'] }
});
```

### `tsconfig.json` (COPY-VERBATIM)
Extends `./.svelte-kit/tsconfig.json`; `strict: true`, `moduleResolution: bundler`,
`checkJs`, `esModuleInterop`, `resolveJsonModule`, `skipLibCheck`, `sourceMap`.

### `components.json` (COPY-ADAPT — shadcn-svelte config)
`tailwind.css = src/app.css`, `baseColor: slate`, aliases `components=$lib/components`,
`utils=$lib/utils`, `ui=$lib/components/ui`, `hooks=$lib/hooks`, `lib=$lib`,
`style: nova`, `iconLibrary: phosphor`. Copy verbatim; AGONE can keep phosphor or switch.

### `.gitignore` (COPY-VERBATIM)
`node_modules`, `build`, `.svelte-kit`, `.surrealdata`, `.env`, `.env.*` (with
`!.env.example`), `*.log`, `.DS_Store`, `_archive/`, `dump-*.surql`, `scripts/backups/`.

### `.env.example` (COPY-ADAPT — rename brand vars)
Blocks: SurrealDB (`SURREAL_URL` ending `/rpc`, `_NAMESPACE`, `_DATABASE`, `_USER`,
`_PASS`), Cloudflare R2 (`CLOUDFLARE_ACCOUNT_ID`, `_R2_ACCESS_KEY_ID`, `_R2_SECRET_ACCESS_KEY`,
`_R2_BUCKET_NAME`, `_R2_PUBLIC_URL`, optional `_R2_JURISDICTION=eu`), App
(`NODE_ENV`, `PUBLIC_BASE_URL`, `PUBLIC_SITE_NAME`, `PUBLIC_DEFAULT_LOCALE`, `BODY_SIZE_LIMIT`),
Mail/Resend (`RESEND_API_KEY`, `MAIL_FROM`, `MAIL_REPLY_TO`, `MAIL_DRY_RUN`, `MAIL_DRY_RUN_TO`),
Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PUBLIC_STRIPE_PUBLISHABLE_KEY`),
optional `CRON_SECRET`, `ANTHROPIC_API_KEY`/`AI_MODEL`, Leaflet map vars.

---

## 2. App shell / SvelteKit wiring

### `src/app.html` (COPY-ADAPT — favicon + theme-color)
Standard SvelteKit shell. Note the `<html lang="fr">` is rewritten per-request by
hooks (`transformPageChunk`). `<meta name="theme-color">` and favicon are brandable.
`<body data-sveltekit-preload-data="hover">`.

### `src/app.d.ts` (COPY-ADAPT — the `user` shape reflects AGONE's user)
Declares `App.Error { message; code? }`, `App.Locals { locale; user }`,
`App.PageData { user?; locale? }`. `user` object carries `id, email, first_name,
last_name, full_name, slug, avatar_url, role, email_verified, lg, orgs?, active_org?`.
Trim `orgs`/`active_org` if AGONE has no multi-company membership model.

### `src/hooks.server.ts` (COPY-VERBATIM — auth+locale resolution)
Single `handle`: resolves locale (cookie `fs_lang` → Accept-Language → default),
loads session user from `SESSION_COOKIE` into `event.locals.user`, aligns locale to
user preference, rewrites `<html lang>`. **Adapt only the cookie name** (see §7).

### `src/routes/+layout.server.ts` (COPY-VERBATIM)
`load = ({ locals }) => ({ user: locals.user, locale: locals.locale })`.

### `src/routes/+layout.svelte` (COPY-ADAPT — imports PublicHeader/Footer)
Imports `app.css`, renders `PublicHeader`/`PublicFooter` for public routes,
bare children for `/app` and `/admin` (they own their sidebar shell), mounts the
`<Toaster>` (svelte-sonner) + `consumeUrlFlash(page.url)` in an `$effect`.

### `src/routes/+error.svelte` (COPY-ADAPT — DB_DOWN / FORBIDDEN handling)
Reads `page.error.code` to show friendly messages for `DB_DOWN`, `FORBIDDEN`, 404.

---

## 3. Core server lib (`src/lib/server/`)

| File | Verdict | Notes |
|------|---------|-------|
| `surreal.ts` | **COPY-VERBATIM** | HTTP client, singleton reconnect w/ auth+conn error retry, `query<T>()` (always returns plain array, `RecordId→"table:id"`, `DateTime→ISO`), `recId(table,id)`, `toPlain()`. Reads `SURREAL_*` from `$env/static/private`. The one indispensable module. |
| `mail.ts` | **COPY-ADAPT** | Resend wrapper. `sendMail()` honours `MAIL_DRY_RUN` (redirects all to `MAIL_DRY_RUN_TO` w/ `[DRY-RUN → ...]` subject), falls back to `console.log` when no `RESEND_API_KEY`. Adapt the HTML `layout()` (brand colors/wordmark) and the domain email builders (`sendLoginEmail` OTP+magic link is reusable; drop `sendContactEmail`/`sendWelcomeEmail` if not needed). |
| `storage.ts` | **COPY-ADAPT** | R2/S3 client (`region:auto`, jurisdiction-aware endpoint), `optimizeImage()` via sharp (webp 82q, maxWidth), `uploadBuffer`, `uploadOptimizedImage`, `getObject`, `listObjects`/`listAllImages`, `deleteFile`/`deletePrefix`. The bottom key-convention helpers (`talentMediaKey`, `filmographyImageKey`, `emailAttachmentKey`…) are FEEDSOURCING/other-domain specific — **replace with AGONE folder conventions**. |
| `media.ts` | **COPY-VERBATIM** | `saveMedia({file,folder,kind,ownerId,alt})` → optimizes if image, uploads to R2, `CREATE media` row, returns `{id,url,key,kind}`. Generic. |
| `account.ts` | **COPY-ADAPT** | `findUserByEmail`, `createUser` (scrypt password, `unsubscribe_token`, default role `pending`), `markEmailVerified` (pending→member), `setPassword`, `setActiveOrg`, `orgRoleOf`. Drop org helpers if no membership model. |
| `access.ts` | **COPY-ADAPT** | Auth guards for load/actions: `requireUser` (→ `/connexion?next=`), `requireStaff`, `requireApp`, `requireOrgEditor`, `requireOrgManager`. Adapt to AGONE's role set. |
| `slug.ts` | **COPY-VERBATIM** | `slugify()` (NFD ascii) + `uniqueSlug(table,base,{field,excludeId})` collision loop. |
| `site.ts` | **COPY-VERBATIM** | `site_setting` key/value store: `getSetting`, `setSetting`, `getBanner`. |
| `stripe.ts` | **COPY-VERBATIM** | Lazy `getStripe()` (null when unconfigured), `isStripeEnabled`, `createCheckoutSession` (subscription mode), `createBillingPortalSession`. |
| `billing.ts` | **COPY-ADAPT** | Plans/subscription logic + `handleWebhookEvent` (checkout.session.completed / subscription.updated / .deleted → upsert `subscription`, denormalize `org.plan`). Adapt entity from `org` to whatever AGONE bills (org vs user). **Only needed if AGONE has paid plans.** |
| `auth/password.ts` | **COPY-VERBATIM** | `hashPassword`/`verifyPassword` (scrypt, `salt:hash`), `generateToken(bytes)`. |
| `auth/session.ts` | **COPY-ADAPT** | `SESSION_COOKIE`, `createSession` (30d, `CREATE session`), `getSessionUser` (joins `user.*`, loads orgs), `destroySession`, `purgeExpiredSessions`. Adapt cookie name + user projection (`loadUserOrgs` is membership-specific). |
| `auth/magic.ts` | **COPY-VERBATIM** | `createMagicLink(email,next)` / `consumeMagicLink(token)` (single-use, 30 min). |
| `auth/otp.ts` | **COPY-VERBATIM** | 6-digit OTP, sha256-hashed, 10 min TTL, 5 attempts. `createOtp`/`verifyOtp`. |
| `resources.ts`, `orgs.ts`, `events.ts`, `listings.ts`, `species.ts`, `studies.ts`, `compliance.ts`, `alerts.ts`, `alert-engine.ts`, `import-engine.ts`, `connectors/*`, `geocode.ts`, `zones.ts`, `ai-extract.ts`, `newsletter.ts`, `contact.ts`, `inbox.ts`, `claims.ts`, `ingredients.ts`, `seats.ts`, `watch.ts`, `my-listings.ts`, `org-manage.ts` | **WRITE-FRESH** | FEEDSOURCING domain modules. AGONE writes its own `src/lib/server/<module>.ts` per feature. |

### `/api` routes

| Route | Verdict | Notes |
|-------|---------|-------|
| `src/routes/api/upload/+server.ts` | **COPY-VERBATIM** | `POST` authenticated (`requireUser`), 15 MB cap, `saveMedia()`, returns `{id,url,kind}`. Pairs with `<ImageUpload>`. |
| `src/routes/api/stripe/webhook/+server.ts` | **COPY-VERBATIM** | Raw-body signature verify, no-op if unconfigured, delegates to `handleWebhookEvent`. |
| `src/routes/api/favorite/+server.ts`, `api/alerts/run/+server.ts` | **WRITE-FRESH** | domain. |

---

## 4. Schema (`src/lib/server/schema.surql`)

**COPY-ADAPT header/conventions VERBATIM; WRITE-FRESH domain tables.**

Reusable **DEFINE conventions** (copy verbatim, the whole idiom is what makes it work):
- Header comment block stating: app connects as **root** (all authz in app layer, no `SCOPE`),
  tables `SCHEMAFULL`, `option<>` fields for back-compat, **`OVERWRITE` everywhere → idempotent
  re-runnable schema**, i18n content as `*_i18n = object { fr, en }`, `updated_at` via
  `VALUE time::now()`.
- Analyzers: `DEFINE ANALYZER OVERWRITE ana_text TOKENIZERS blank,class,camel FILTERS lowercase,ascii;`
  and `ana_prefix` (edgengram 2→12).
- Functions: `fn::slugify($t)` (wraps `string::slug`), `fn::t($o,$lg)` (i18n picker fr→en→first).
- Full-text index idiom: `DEFINE INDEX OVERWRITE ft_<t>_name ON <t> FIELDS name FULLTEXT ANALYZER ana_text BM25;`
- Timestamp idiom: `created_at datetime DEFAULT time::now()` +
  `updated_at datetime DEFAULT time::now() VALUE time::now()`.
- Enum idiom: `TYPE string ASSERT $value IN [...] DEFAULT '...'`.

**Auth tables — COPY-VERBATIM** (this is the reusable auth core):
- `media` (key,url,kind ASSERT in [image,logo,document,avatar,cover],mime,filename,size,width,height,alt,owner→user,created_at).
- `user` (email UNIQUE + `string::is_email`, password_hash, first/last/full_name via
  `VALUE string::concat`, slug UNIQUE, phone, job_title, avatar→media, lg, `role` ASSERT
  IN [superadmin,admin,pro,member,pending] DEFAULT pending, profile, active_org→org,
  is_active, email_verified, accepts_newsletter, unsubscribe_token, notes, timestamps).
  Adapt the `role` enum + drop `active_org`/`profile` per AGONE.
- `session` (user→user, expires_at, user_agent, ip, created_at; INDEX on user).
- `magic_link` (email, next, used, expires_at, created_at).
- `email_otp` (email, purpose, code_hash, attempts, used, expires_at; INDEX email,purpose).
- `password_reset` (user, used, expires_at, created_at).
- `site_setting` (key UNIQUE, value object FLEXIBLE).

**WRITE-FRESH domain tables** (FEEDSOURCING's `org`, `establishment`, `certification`,
`ingredient`, `ingredient_category`, `resource`, `event`, `listing`, `plan`,
`subscription`, `alert`, `notification`, `newsletter_subscriber`, `contact_message`,
`species`, `compliance_entry`, `study`, `data_source`, `import_run`, `import_candidate`,
`org_claim` and RELATE edges `member_of`/`linked_to`/`certified`/`supplies`/`watches`).
Keep `plan`/`subscription` verbatim only if AGONE bills subscriptions. AGONE (a
publishing house / bookstore per the server context) will define e.g. `book`, `author`,
`order`, `product` tables instead — but reuse the exact DEFINE idioms above.

RELATE edge idiom to reuse: `DEFINE TABLE OVERWRITE <edge> TYPE RELATION IN <a> OUT <b>
SCHEMAFULL;` + fields + `DEFINE INDEX OVERWRITE idx_<edge>_uniq ON <edge> FIELDS in, out UNIQUE;`.

---

## 5. i18n (`src/lib/i18n/`)

### `index.ts` (COPY-ADAPT — change `LOCALE_COOKIE` name only)
Homegrown, build-dependency-free i18n. Mechanics:
- `import.meta.glob('./ns/*.ts', { eager: true })` auto-loads every namespace — **no
  index to maintain**. Each `ns/<module>.ts` exports `{ messages: { fr:{...}, en:{...} } }`.
- Messages are flattened to dotted keys (`monmodule.title`), stored per locale.
- `translate(locale, key, params?)` (server, in load/actions), `t(key, params?)`
  (reactive component sugar reading `page.data.locale`), `normalizeLocale`, `pickI18n(obj,locale)`
  for DB-stored `{fr,en}` editorial content.
- Exports `Locale='fr'|'en'`, `LOCALES`, `DEFAULT_LOCALE`, `LOCALE_LABEL/SHORT`,
  `LOCALE_COOKIE='fs_lang'` (**rename for AGONE**).
- Interpolation: `{n}` placeholders replaced via `params`.

### `ns/common.ts` (COPY-ADAPT — the shared chrome keys)
Holds `brand.*`, `common.*` (loading/save/cancel/search/... ~60 keys), `nav.*`,
`footer.*`, `auth.*`, `admin.nav.*`, account keys. Every module namespace
(`ns/home.ts`, `ns/admin.ts`, …) is **WRITE-FRESH** per AGONE feature. Rule: never
edit another module's namespace.

`src/routes/set-locale/+server.ts` (COPY-ADAPT): GET sets `LOCALE_COOKIE` (1y),
redirects back to referer.

---

## 6. Design system (`src/lib/components/` + `src/app.css`)

### `app.css` (COPY-ADAPT — swap the token values for AGONE's brand)
Structure to keep verbatim:
- `@import 'tailwindcss'; @import 'tw-animate-css'; @import 'shadcn-svelte/tailwind.css';
  @import '@fontsource-variable/roboto';` (+ leaflet if maps).
- `@custom-variant dark (&:is(.dark *));`
- `:root { ... }` light tokens + `.dark { ... }` overrides + `@theme inline { --color-*: var(--*) }`
  bridge exposing tokens as Tailwind color utilities (`bg-background`, `text-primary`,
  `bg-sidebar`, `bg-card`, `border-border`, `text-muted-foreground`, semantic
  `text-success`/`bg-destructive`/`text-warning`, `--brand-*`, chart-1..5, radius sm/md/lg/xl,
  `--font-sans/display/mono`).
- `@layer base` (border-border on `*`, body `bg-background text-foreground antialiased`,
  headings `font-display` + tight tracking, placeholder styling).
- Utilities `.eyebrow` (uppercase micro-label), `.btn-brand` (brand CTA), `.bg-grid`/`.bg-grid-fade`
  (hero textures), leaflet + `.page-head` overrides.
**AGONE:** replace the FEEDSOURCING/ALL4FEED gold+black palette values with AGONE's
brand colors; keep the token *names* so components are untouched.

### Home-made components

| Component | Verdict | Notes |
|-----------|---------|-------|
| `Logo.svelte` | **WRITE-FRESH** | FEEDSOURCING hexagon `<>` mark + wordmark. AGONE draws its own; keep the props contract (`variant 'full'|'mark'`, `tone 'color'|'light'`, `size`, `class`). |
| `Icon.svelte` | **COPY-ADAPT** | Name→phosphor component registry (`<script module>` MAP). Add/remove icon names AGONE uses. |
| `ImageUpload.svelte` | **COPY-VERBATIM** | `bind:mediaId bind:url folder="..." kind=...` → POSTs `/api/upload`. Generic. |
| `PublicHeader.svelte` | **COPY-ADAPT** | Sticky header, `PUBLIC_NAV` loop, LanguageSwitcher, UserMenu / login+signup buttons, mobile menu. Adapt nav + branding. |
| `PublicFooter.svelte` | **COPY-ADAPT** | Footer grid, newsletter form (`POST /newsletter`), legal links. Adapt links/columns. |
| `DashboardShell.svelte` | **COPY-VERBATIM** | Sidebar shell (items:NavItem[], user, title, children snippet) used by `/app` and `/admin`. Marine sidebar, active-state, user block, logout. Reusable as-is. |
| `LanguageSwitcher.svelte`, `UserMenu.svelte` | **COPY-ADAPT** | chrome; adapt links. |
| `OrgCard`, `IngredientCard`, `ListingCard`, `OrgMap`, `OrgQuickView`, `FavoriteButton` | **WRITE-FRESH** | domain cards. |

### `nav.ts` (COPY-ADAPT)
Defines `NavItem { key (i18n), href, icon? }` + `PUBLIC_NAV`, `APP_NAV`, `ADMIN_NAV`
arrays. Rewrite the entries for AGONE's routes; keep the interface + the i18n-key pattern.

### UI kit `src/lib/components/ui/` (COPY-VERBATIM, add more via shadcn CLI)
Present: `badge, button, card, checkbox, dialog, dropdown-menu, field, input, label,
select, separator, table, tabs, textarea`. These are shadcn-svelte generated
(bits-ui + tailwind-variants). Copy the folder verbatim, or regenerate with
`shadcn-svelte` CLI using `components.json`. `button` variants: `default, brand,
secondary, outline, ghost, destructive, link`; sizes `sm|default|lg|icon`.

### `utils.ts` (COPY-VERBATIM)
`cn()` (clsx + tailwind-merge) + `WithoutChild/WithoutChildren/WithElementRef` shadcn types.

### `toasts.ts` (COPY-VERBATIM)
Re-exports `toast`; `consumeUrlFlash(url)` (shows `?flash=&flash_type=` after redirect,
cleans URL via `replaceState`); `withFlash(path,msg,type)` builder for server redirects.

---

## 7. Auth flow (end-to-end)

1. `hooks.server.ts` reads `SESSION_COOKIE` → `getSessionUser(token)` → `locals.user`
   (or null). Also resolves `locals.locale`.
2. `+layout.server.ts` exposes `{user, locale}` to every page as `page.data`.
3. Guards in `+page.server.ts`/`+layout.server.ts` load functions: `requireApp`
   (space `/app`), `requireStaff` (`/admin`), `requireUser`. Unauthed → redirect
   `/connexion?next=`.
4. **`/connexion`** (`+page.server.ts`, COPY-ADAPT) actions:
   - `password`: verify scrypt hash → `createSession` → set cookie → redirect `next`.
   - `request_otp`: anti-enumeration; `createOtp` + `createMagicLink` → `sendLoginEmail`.
   - `verify_otp`: `verifyOtp` → `markEmailVerified` → `createSession` → cookie → redirect.
5. **`/magic/[token]/+server.ts`** (COPY-VERBATIM logic): `consumeMagicLink` → find user →
   verify email → session cookie → redirect to `next` with flash.
6. **`/inscription`** (`+page.server.ts`, COPY-ADAPT): `createUser` (role `member`,
   email to confirm) → session → welcome/confirm mail.
7. **`/deconnexion/+server.ts`** (COPY-VERBATIM): GET+POST destroy session + delete cookie.
Cookie: `httpOnly, sameSite:'lax', secure: url.protocol==='https:', maxAge:30d`.
**Rename `SESSION_COOKIE` / `LOCALE_COOKIE`** from `fs_session`/`fs_lang` to AGONE
prefixes (e.g. `ag_session`/`ag_lang`) — single edit in `auth/session.ts` and `i18n/index.ts`.

---

## 8. Scripts (`scripts/`)

| Script | Verdict | Notes |
|--------|---------|-------|
| `apply-schema.ts` | **COPY-VERBATIM** | Loads `.env`, connects Surreal, `db.query(readFileSync('src/lib/server/schema.surql'))`. Run via `bun run schema`. Idempotent thanks to `OVERWRITE`. |
| `db-export.ts` | **COPY-VERBATIM** | Wraps `surreal export` CLI (ws→http URL rewrite, `--only-schemas` flag). |
| `db-import-cloud.ts` | **COPY-VERBATIM** | Wraps `surreal import` using `.env.cloud` credentials. |
| `seed.ts` | **WRITE-FRESH** (keep the harness) | Copy the top harness verbatim: `.env` loader, `hashPassword`, `slugify`, `point()`, Surreal connect/use/signin, idempotent upsert idiom `DELETE <t> WHERE code=$c; CREATE <t> CONTENT $x`. Replace the FEEDSOURCING referential data (plans, certifications, ingredient taxonomy, admin user) with AGONE's own referentials + admin account. |
| `seed-sources.ts`, `seed-integrity.ts`, `analyze-dupes.ts`, `dedupe-*.ts`, `restore-import.ts`, `import-prospects-*.ts`, `backfill-*.ts` | **WRITE-FRESH / skip** | domain/migration. |

How schema+seed reach the cloud: set `.env` to the cloud instance (`SURREAL_URL`
ends in `/rpc`), then `bun run schema` (applies DEFINEs) and `bun run seed`
(referentials + admin). Both connect as root over HTTP.

---

## 9. Concrete checklists

### A. COPY-VERBATIM (reusable skeleton, no domain in them)
```
svelte.config.js
vite.config.ts
tsconfig.json
src/routes/+layout.server.ts
src/hooks.server.ts                     (rename cookie constants only)
src/lib/server/surreal.ts
src/lib/server/media.ts
src/lib/server/slug.ts
src/lib/server/site.ts
src/lib/server/stripe.ts
src/lib/server/auth/password.ts
src/lib/server/auth/magic.ts
src/lib/server/auth/otp.ts
src/routes/api/upload/+server.ts
src/routes/api/stripe/webhook/+server.ts
src/routes/deconnexion/+server.ts
src/lib/utils.ts
src/lib/toasts.ts
src/lib/components/ImageUpload.svelte
src/lib/components/DashboardShell.svelte
src/lib/components/ui/*                  (or regenerate via shadcn CLI)
scripts/apply-schema.ts
scripts/db-export.ts
scripts/db-import-cloud.ts
```

### B. COPY-ADAPT (copy, then edit branding / roles / tables / cookie names)
```
package.json            (name + dep pruning)
components.json         (brand baseColor optional)
.gitignore              (verbatim ok)
.env.example            (rename brand vars)
src/app.html            (favicon, theme-color)
src/app.d.ts            (user shape)
src/routes/+layout.svelte
src/routes/+error.svelte
src/lib/server/mail.ts          (layout HTML + brand builders)
src/lib/server/storage.ts       (key-convention helpers)
src/lib/server/account.ts       (roles, org helpers)
src/lib/server/access.ts        (role guards)
src/lib/server/auth/session.ts  (cookie name, user projection)
src/lib/server/billing.ts       (only if paid plans)
src/lib/i18n/index.ts           (LOCALE_COOKIE name)
src/lib/i18n/ns/common.ts       (chrome strings)
src/app.css                     (palette tokens)
src/lib/components/Icon.svelte  (icon registry)
src/lib/components/PublicHeader.svelte
src/lib/components/PublicFooter.svelte
src/lib/components/LanguageSwitcher.svelte
src/lib/components/UserMenu.svelte
src/lib/nav.ts                  (nav arrays)
src/routes/set-locale/+server.ts
src/routes/connexion/+page.(server.ts|svelte)
src/routes/magic/[token]/+server.ts
src/routes/inscription/+page.(server.ts|svelte)
src/lib/server/schema.surql     (header idioms + auth tables verbatim; domain fresh)
scripts/seed.ts                 (harness verbatim; data fresh)
```

### C. WRITE-FRESH (AGONE domain — do not copy)
```
src/lib/server/<domain>.ts modules (books, authors, orders, catalogue…)
src/lib/i18n/ns/<domain>.ts namespaces
src/lib/components/<DomainCard>.svelte
src/lib/components/Logo.svelte
src/routes/<public modules>/…
src/routes/app/… and src/routes/admin/… domain pages
domain tables + RELATE edges in schema.surql
domain seed data
```

### D. Minimal bootable AGONE (empty schema + auth + shell + one public page)
Copy/adapt exactly this set, nothing more:
```
package.json, svelte.config.js, vite.config.ts, tsconfig.json, components.json,
.gitignore, .env  (with SURREAL_* pointing at the cloud instance)
src/app.html, src/app.d.ts, src/app.css
src/hooks.server.ts
src/lib/utils.ts, src/lib/toasts.ts, src/lib/roles.ts, src/lib/nav.ts
src/lib/i18n/index.ts, src/lib/i18n/ns/common.ts
src/lib/server/surreal.ts
src/lib/server/auth/{password,session,magic,otp}.ts
src/lib/server/account.ts, src/lib/server/access.ts, src/lib/server/mail.ts
src/lib/components/{Logo,Icon,PublicHeader,PublicFooter,DashboardShell,LanguageSwitcher,UserMenu}.svelte
src/lib/components/ui/{button,input,label,card}      (minimum UI)
src/routes/+layout.server.ts, +layout.svelte, +error.svelte
src/routes/+page.svelte (+ +page.server.ts)          ← the one public page
src/routes/connexion/+page.{server.ts,svelte}
src/routes/inscription/+page.{server.ts,svelte}
src/routes/magic/[token]/+server.ts
src/routes/deconnexion/+server.ts
src/routes/set-locale/+server.ts
src/routes/app/+layout.{server.ts,svelte} + src/routes/app/+page.{server.ts,svelte}   ← proves the guarded shell
src/lib/server/schema.surql   (auth core tables only: media,user,session,magic_link,email_otp,password_reset,site_setting)
scripts/apply-schema.ts, scripts/seed.ts (admin user only)
```
Boot sequence: `bun install` → fill `.env` → `bun run schema` → `bun run seed`
(admin) → `bun run dev` → visit `/`, sign in at `/connexion`, land on guarded `/app`.
`bun run check` must be 0 errors.

---

## 10. Key conventions to carry over (from CLAUDE.md)
- One server module per feature `src/lib/server/<module>.ts`; one i18n namespace per
  module `src/lib/i18n/ns/<module>.ts` (auto-loaded).
- All authorization in the app layer (Surreal connected as **root**, no SCOPE).
- `query<T>()` always returns plain arrays; `FROM ONLY` returns an object (don't
  destructure `const [x]=`); use `recId(table,id)` for record targeting.
- Every visible string via i18n (FR+EN); every editorial content field as `*_i18n {fr,en}`.
- Redirect-with-toast via `throw redirect(303, withFlash(path,msg,type))`.
- Uploads via `<ImageUpload bind:mediaId bind:url folder=…>` → `/api/upload` → `media` record.
- `bun run check` at 0 errors is the golden rule.
```
```
