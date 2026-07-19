/**
 * Import pré-production depuis l'ancien WordPress/WooCommerce (LECTURE SEULE).
 *
 * Objectif : « récupérer les derniers X » avant la bascule en prod, sans re-migrer
 * tout le catalogue. Idempotent : chaque enregistrement est apparié par `legacy_wp_id`
 * (= ID du post/utilisateur WordPress). Ré-exécutable sans doublon.
 *
 * Ne fait QUE des SELECT côté WordPress (via wp-db.ts). N'écrit que dans Surreal.
 * Un mode `dryRun` calcule ce qui serait créé/mis à jour sans rien écrire.
 */
import { GeometryPoint } from 'surrealdb';
import { query, recId } from './surreal';
import { uniqueSlug, slugify } from './slug';
import { wpQuery, wpPrefix } from './wp-db';
import { wpautop } from './wpautop';

export interface ImportResult {
  type: string;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  warnings: string[];
  dryRun: boolean;
}

/* ————————————————————— helpers ————————————————————— */

/** SET dynamique : valeur vide → NONE (évite les NULL sur champs optionnels). */
function buildSet(fields: Record<string, unknown>): { sql: string; vars: Record<string, unknown> } {
  const parts: string[] = [];
  const vars: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    // '' est une valeur valide pour les champs string requis (first_name/last_name…) :
    // seuls undefined/null/NaN deviennent NONE (pour les champs option<>).
    const empty = v === undefined || v === null || (typeof v === 'number' && Number.isNaN(v));
    if (empty) {
      parts.push(`${k} = NONE`);
    } else if (v instanceof Date) {
      // Le SDK ne sérialise pas un Date JS en datetime : on passe l'ISO et on caste.
      vars[k] = v.toISOString();
      parts.push(`${k} = type::datetime($${k})`);
    } else {
      vars[k] = v;
      parts.push(`${k} = $${k}`);
    }
  }
  return { sql: parts.join(', '), vars };
}

/** Indexe des lignes meta {<idKey>, meta_key, meta_value} en Map<id, {key:value}>. */
function metaIndex(rows: any[], idKey: string): Map<number, Record<string, string>> {
  const m = new Map<number, Record<string, string>>();
  for (const r of rows) {
    const id = Number(r[idKey]);
    if (!m.has(id)) m.set(id, {});
    m.get(id)![String(r.meta_key)] = r.meta_value == null ? '' : String(r.meta_value);
  }
  return m;
}

/** Date MySQL (chaîne 'YYYY-MM-DD HH:MM:SS', UTC) → Date. */
function mysqlDate(v: unknown): Date | undefined {
  const s = String(v ?? '').trim();
  if (!s || s.startsWith('0000')) return undefined;
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return isNaN(+d) ? undefined : d;
}

function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Bloc adresse WooCommerce (_billing_* / _shipping_*) → objet propre ou undefined. */
function address(meta: Record<string, string>, prefix: string): Record<string, string> | undefined {
  const keys = ['first_name', 'last_name', 'company', 'address_1', 'address_2', 'city', 'postcode', 'state', 'country', 'phone', 'email'];
  const o: Record<string, string> = {};
  for (const k of keys) {
    const v = (meta[prefix + k] ?? '').trim();
    if (v) o[k] = v;
  }
  return Object.keys(o).length ? o : undefined;
}

/* ————————————————————— Utilisateurs ————————————————————— */

const USER_META_KEYS = [
  'first_name', 'last_name',
  'billing_first_name', 'billing_last_name', 'billing_company', 'billing_address_1', 'billing_address_2',
  'billing_city', 'billing_postcode', 'billing_state', 'billing_country', 'billing_phone', 'billing_email',
  'shipping_first_name', 'shipping_last_name', 'shipping_company', 'shipping_address_1', 'shipping_address_2',
  'shipping_city', 'shipping_postcode', 'shipping_state', 'shipping_country'
];

async function findUserId(wpId: number, email: string): Promise<string | null> {
  const byLegacy = await query<any>(`SELECT meta::id(id) AS pid FROM user WHERE legacy_wp_id = $w LIMIT 1`, { w: wpId });
  if (byLegacy[0]?.pid) return byLegacy[0].pid;
  const byEmail = await query<any>(`SELECT meta::id(id) AS pid FROM user WHERE email = $e LIMIT 1`, { e: email });
  return byEmail[0]?.pid ?? null;
}

export async function importUsers(opts: { limit?: number; dryRun?: boolean } = {}): Promise<ImportResult> {
  const limit = Math.min(Math.max(1, opts.limit ?? 100), 5000);
  const dryRun = !!opts.dryRun;
  const p = wpPrefix();
  const warnings: string[] = [];
  let created = 0, updated = 0, skipped = 0;

  const users = await wpQuery<any>(
    `SELECT ID, user_login, user_email, user_registered, display_name FROM ${p}users ORDER BY ID DESC LIMIT ?`,
    [limit]
  );
  const ids = users.map((u) => Number(u.ID));
  const meta = ids.length
    ? metaIndex(
        await wpQuery<any>(
          `SELECT user_id, meta_key, meta_value FROM ${p}usermeta
             WHERE user_id IN (${ids.map(() => '?').join(',')}) AND meta_key IN (${USER_META_KEYS.map(() => '?').join(',')})`,
          [...ids, ...USER_META_KEYS]
        ),
        'user_id'
      )
    : new Map<number, Record<string, string>>();

  for (const u of users) {
    const wpId = Number(u.ID);
    const email = String(u.user_email ?? '').trim().toLowerCase();
    if (!email) { skipped++; warnings.push(`Utilisateur WP #${wpId} sans e-mail — ignoré.`); continue; }

    const m = meta.get(wpId) ?? {};
    const first = (m.first_name || m.billing_first_name || '').trim();
    const last = (m.last_name || m.billing_last_name || '').trim();
    const full = `${first} ${last}`.trim() || String(u.display_name ?? '').trim() || email;
    const billing = address(m, 'billing_');
    const shipping = address(m, 'shipping_');
    const phone = (m.billing_phone || '').trim() || undefined;
    const createdAt = mysqlDate(u.user_registered);

    const existing = await findUserId(wpId, email);
    if (dryRun) { existing ? updated++ : created++; continue; }

    // full_name est calculé (VALUE) côté schéma → on ne le pose pas.
    try {
      let userPid: string;
      if (existing) {
        const fields: Record<string, unknown> = { legacy_wp_id: wpId, first_name: first, last_name: last, phone, billing, shipping };
        if (createdAt) fields.created_at = createdAt; // backfill de la vraie date d'inscription
        const { sql, vars } = buildSet(fields);
        await query(`UPDATE $id SET ${sql}`, { ...vars, id: recId('user', existing) });
        userPid = existing;
        updated++;
      } else {
        const slug = await uniqueSlug('user', full || email);
        const { sql, vars } = buildSet({
          email, first_name: first, last_name: last, slug,
          role: 'customer', email_verified: true, is_active: true, legacy_wp_id: wpId,
          phone, billing, shipping, created_at: createdAt
        });
        const rows = await query<any>(`CREATE user SET ${sql}`, vars);
        userPid = String(rows[0].id).replace(/^user:/, '');
        created++;
      }
      // Sens inverse : rattacher les commandes orphelines (même e-mail, sans client).
      await query(
        `UPDATE order SET customer = $u WHERE string::lowercase(email) = $em AND customer = NONE`,
        { u: recId('user', userPid), em: email }
      );
    } catch (e) {
      skipped++;
      warnings.push(`Utilisateur WP #${wpId} (${email}) ignoré : ${e instanceof Error ? e.message.split('\n')[0] : 'erreur'}`);
    }
  }

  return { type: 'users', fetched: users.length, created, updated, skipped, warnings: warnings.slice(0, 20), dryRun };
}

/* ————————————————————— Commandes ————————————————————— */

const ORDER_META_KEYS = [
  '_customer_user', '_order_total', '_order_shipping', '_order_currency', '_order_key',
  '_billing_first_name', '_billing_last_name', '_billing_company', '_billing_address_1', '_billing_address_2',
  '_billing_city', '_billing_postcode', '_billing_state', '_billing_country', '_billing_phone', '_billing_email',
  '_shipping_first_name', '_shipping_last_name', '_shipping_company', '_shipping_address_1', '_shipping_address_2',
  '_shipping_city', '_shipping_postcode', '_shipping_state', '_shipping_country',
  '_date_paid', '_paid_date', '_completed_date', '_date_completed', '_wcpdf_invoice_number_data',
  '_transaction_id', '_payment_intent_id'
];

const STATUS_MAP: Record<string, string> = {
  'wc-completed': 'completed', 'wc-processing': 'processing', 'wc-pending': 'pending',
  'wc-on-hold': 'processing', 'wc-cancelled': 'cancelled', 'wc-refunded': 'refunded',
  'wc-failed': 'failed', 'wc-subscription': 'completed'
};
const FORMAT_MAP: Record<string, string> = { papier: 'papier', epub: 'epub', souscription: 'souscription', papioer: 'papier', livre: 'papier' };

function invoiceNumber(serialized: string): number | undefined {
  const m = /"number";(?:i:(\d+)|s:\d+:"(\d+)")/.exec(serialized || '');
  const n = m ? Number(m[1] ?? m[2]) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export async function importOrders(opts: { limit?: number; dryRun?: boolean } = {}): Promise<ImportResult> {
  const limit = Math.min(Math.max(1, opts.limit ?? 100), 5000);
  const dryRun = !!opts.dryRun;
  const p = wpPrefix();
  const warnings: string[] = [];
  let created = 0, updated = 0, skipped = 0;

  const orders = await wpQuery<any>(
    `SELECT ID, post_status, post_date_gmt FROM ${p}posts WHERE post_type = 'shop_order' ORDER BY ID DESC LIMIT ?`,
    [limit]
  );
  const oids = orders.map((o) => Number(o.ID));
  if (!oids.length) return { type: 'orders', fetched: 0, created, updated, skipped, warnings, dryRun };

  const ometa = metaIndex(
    await wpQuery<any>(
      `SELECT post_id, meta_key, meta_value FROM ${p}postmeta
         WHERE post_id IN (${oids.map(() => '?').join(',')}) AND meta_key IN (${ORDER_META_KEYS.map(() => '?').join(',')})`,
      [...oids, ...ORDER_META_KEYS]
    ),
    'post_id'
  );

  const items = await wpQuery<any>(
    `SELECT order_id, order_item_id, order_item_name FROM ${p}woocommerce_order_items
       WHERE order_id IN (${oids.map(() => '?').join(',')}) AND order_item_type = 'line_item'`,
    [...oids]
  );
  const itemIds = items.map((i) => Number(i.order_item_id));
  const imeta = itemIds.length
    ? metaIndex(
        await wpQuery<any>(
          `SELECT order_item_id, meta_key, meta_value FROM ${p}woocommerce_order_itemmeta
             WHERE order_item_id IN (${itemIds.map(() => '?').join(',')})
               AND meta_key IN ('_id_livre','format','_qty','_line_total','_line_subtotal')`,
          [...itemIds]
        ),
        'order_item_id'
      )
    : new Map<number, Record<string, string>>();

  const itemsByOrder = new Map<number, any[]>();
  for (const it of items) {
    const oid = Number(it.order_id);
    if (!itemsByOrder.has(oid)) itemsByOrder.set(oid, []);
    itemsByOrder.get(oid)!.push({ name: it.order_item_name, meta: imeta.get(Number(it.order_item_id)) ?? {} });
  }

  // Appariements en lot : livres (par legacy_wp_id) et clients (par legacy_wp_id).
  const livreIds = new Set<number>();
  const customerIds = new Set<number>();
  for (const o of orders) {
    const m = ometa.get(Number(o.ID)) ?? {};
    const cu = Number(m._customer_user ?? 0);
    if (cu > 0) customerIds.add(cu);
    for (const l of itemsByOrder.get(Number(o.ID)) ?? []) {
      const bid = Number(l.meta._id_livre ?? 0);
      if (bid > 0) livreIds.add(bid);
    }
  }
  const bookMap = new Map<number, string>();
  if (livreIds.size) {
    const rows = await query<any>(`SELECT meta::id(id) AS pid, legacy_wp_id FROM book WHERE legacy_wp_id IN $ids`, { ids: [...livreIds] });
    for (const r of rows) bookMap.set(Number(r.legacy_wp_id), r.pid);
  }
  const userMap = new Map<number, string>();
  if (customerIds.size) {
    const rows = await query<any>(`SELECT meta::id(id) AS pid, legacy_wp_id FROM user WHERE legacy_wp_id IN $ids`, { ids: [...customerIds] });
    for (const r of rows) userMap.set(Number(r.legacy_wp_id), r.pid);
  }
  // Appariement complémentaire par e-mail (client sans legacy_wp_id, ou déjà présent autrement).
  const orderEmails = new Set<string>();
  for (const o of orders) {
    const em = String((ometa.get(Number(o.ID)) ?? {})._billing_email ?? '').trim().toLowerCase();
    if (em) orderEmails.add(em);
  }
  const emailMap = new Map<string, string>();
  if (orderEmails.size) {
    const rows = await query<any>(
      `SELECT meta::id(id) AS pid, string::lowercase(email) AS em FROM user WHERE string::lowercase(email) IN $emails`,
      { emails: [...orderEmails] }
    );
    for (const r of rows) if (r.em) emailMap.set(r.em, r.pid);
  }

  for (const o of orders) {
    const wpId = Number(o.ID);
    const m = ometa.get(wpId) ?? {};
    const status = STATUS_MAP[String(o.post_status)] ?? 'pending';
    const createdAt = mysqlDate(o.post_date_gmt);
    const paidAt = m._date_paid ? new Date(Number(m._date_paid) * 1000) : mysqlDate(m._paid_date);
    const completedAt = mysqlDate(m._completed_date || m._date_completed);

    const existing = await query<any>(`SELECT meta::id(id) AS pid FROM order WHERE legacy_wp_id = $w LIMIT 1`, { w: wpId });
    if (existing[0]?.pid) {
      // Déjà importée : on rafraîchit seulement le statut / dates.
      if (!dryRun) {
        const { sql, vars } = buildSet({ status, paid_at: paidAt, completed_at: completedAt });
        await query(`UPDATE $id SET ${sql}`, { ...vars, id: recId('order', existing[0].pid) });
      }
      updated++;
      continue;
    }
    if (dryRun) { created++; continue; }

    const lines = itemsByOrder.get(wpId) ?? [];
    let subtotal = 0, itemCount = 0, hasEbook = false, hasPhysical = false;
    const toRelate: { bookPid: string; format: string; qty: number; unit: number; total: number; title: string }[] = [];
    for (const l of lines) {
      const bid = Number(l.meta._id_livre ?? 0);
      const qty = Math.max(1, Number(num(l.meta._qty)) || 1);
      const total = num(l.meta._line_total) ?? num(l.meta._line_subtotal) ?? 0;
      const format = FORMAT_MAP[String(l.meta.format ?? '').toLowerCase()] ?? 'papier';
      subtotal += total; itemCount += qty;
      if (format === 'epub') hasEbook = true; else hasPhysical = true;
      const bookPid = bookMap.get(bid);
      if (!bookPid) { warnings.push(`Commande #${wpId} : livre WP ${bid || '?'} introuvable (ligne « ${l.name} »).`); continue; }
      toRelate.push({ bookPid, format, qty, unit: qty ? r2(total / qty) : total, total: r2(total), title: String(l.name ?? '') });
    }

    const email = (m._billing_email || '').trim().toLowerCase();
    const customerPid = userMap.get(Number(m._customer_user ?? 0)) ?? (email ? emailMap.get(email) : undefined);
    const { sql, vars } = buildSet({
      number: wpId, legacy_wp_id: wpId, status, channel: 'web',
      customer: customerPid ? recId('user', customerPid) : undefined,
      email: email || undefined,
      currency: (m._order_currency || 'EUR').trim(),
      billing: address(m, '_billing_'), shipping: address(m, '_shipping_'),
      item_count: itemCount, subtotal: r2(subtotal), shipping_total: num(m._order_shipping) ?? 0,
      total: num(m._order_total) ?? r2(subtotal), has_ebook: hasEbook, has_physical: hasPhysical,
      invoice_number: invoiceNumber(m._wcpdf_invoice_number_data),
      created_at: createdAt, paid_at: paidAt, completed_at: completedAt
    });
    try {
      const rows = await query<any>(`CREATE order SET ${sql}`, vars);
      const orderPid = String(rows[0].id).replace(/^order:/, '');
      for (const rel of toRelate) {
        await query(
          `RELATE $o->contains->$b SET format = $format, qty = $qty, unit_price = $unit, line_total = $total, title_snapshot = $title`,
          { o: recId('order', orderPid), b: recId('book', rel.bookPid), format: rel.format, qty: rel.qty, unit: rel.unit, total: rel.total, title: rel.title }
        );
      }
      created++;
    } catch (e) {
      skipped++;
      warnings.push(`Commande #${wpId} ignorée : ${e instanceof Error ? e.message.split('\n')[0] : 'erreur'}`);
    }
  }

  // Remonte le compteur de n° de commande au-dessus du max importé (évite les collisions).
  if (!dryRun && created > 0) {
    const mx = await query<any>(`SELECT math::max(number) AS m FROM order GROUP ALL`);
    const maxN = Number(mx[0]?.m ?? 0);
    const ex = await query<any>(`SELECT meta::id(id) AS pid, value.order_number AS n FROM site_setting WHERE key = 'counters' LIMIT 1`);
    if (ex[0]?.pid) {
      if (Number(ex[0].n ?? 0) < maxN) await query(`UPDATE $id SET value.order_number = $m`, { id: recId('site_setting', ex[0].pid), m: maxN });
    } else {
      await query(`CREATE site_setting SET key = 'counters', value = { order_number: $m }`, { m: maxN });
    }
  }

  return { type: 'orders', fetched: orders.length, created, updated, skipped, warnings: warnings.slice(0, 30), dryRun };
}

/* ═════════════════════ Contenu : auteurs / articles / livres / rencontres ═════════════════════
   Reprend fidèlement les mappings des scripts de migration (scripts/migrate-*.ts) pour rester
   cohérent avec le catalogue déjà migré. Appariement par legacy_wp_id (idempotent). */

/** IDs de posts dans un tableau PHP sérialisé (`a:1:{i:0;s:4:"8889";}`). */
function parseWpIds(serialized: unknown): number[] {
  const s = String(serialized ?? '');
  const out: number[] = [];
  const re = /s:\d+:"(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(Number(m[1]));
  return out;
}

/** Valeur d'un champ dans un blob PHP sérialisé (champ ACF google_map `lieu`). */
function phpField(blob: string, key: string): string | undefined {
  const idx = blob.indexOf(`"${key}";`);
  if (idx < 0) return undefined;
  const rest = blob.slice(idx + key.length + 3);
  let m = rest.match(/^s:\d+:"([^"]*)"/); if (m) return m[1] || undefined;
  m = rest.match(/^d:([-0-9.eE]+)/); if (m) return m[1];
  m = rest.match(/^i:(-?\d+)/); if (m) return m[1];
  return undefined;
}

/** Date ACF `YYYYMMDD` → Date. */
function wpDate8(v: unknown): Date | undefined {
  const s = String(v ?? '').trim();
  if (!/^\d{8}$/.test(s)) return undefined;
  const dt = new Date(`${s.slice(0, 4)}-${s.slice(4, 6) === '00' ? '01' : s.slice(4, 6)}-${s.slice(6, 8) === '00' ? '01' : s.slice(6, 8)}T00:00:00Z`);
  return isNaN(+dt) ? undefined : dt;
}

function stripHtml(s: unknown): string {
  return String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

/** Map legacy → id Surreal (plain) pour une table. */
async function legacyMap(table: string, field = 'legacy_wp_id'): Promise<Map<number, string>> {
  const rows = await query<any>(`SELECT meta::id(id) AS pid, ${field} AS k FROM ${table} WHERE ${field} != NONE`);
  const m = new Map<number, string>();
  for (const r of rows) m.set(Number(r.k), r.pid);
  return m;
}

/** Charge les catégories WP (première par post) pour une liste de posts. */
async function firstTermByPost(p: string, postIds: number[], taxonomy: string): Promise<Map<number, number>> {
  if (!postIds.length) return new Map();
  const rows = await wpQuery<any>(
    `SELECT tr.object_id AS oid, tt.term_id AS term FROM ${p}term_relationships tr
       JOIN ${p}term_taxonomy tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
      WHERE tt.taxonomy = ? AND tr.object_id IN (${postIds.map(() => '?').join(',')})`,
    [taxonomy, ...postIds]
  );
  const m = new Map<number, number>();
  for (const r of rows) if (!m.has(Number(r.oid))) m.set(Number(r.oid), Number(r.term)); // 1re catégorie
  return m;
}

/* ————————————————————— Auteurs ————————————————————— */

export async function importAuthors(opts: { limit?: number; dryRun?: boolean } = {}): Promise<ImportResult> {
  const limit = Math.min(Math.max(1, opts.limit ?? 100), 5000);
  const dryRun = !!opts.dryRun;
  const p = wpPrefix();
  const warnings: string[] = [];
  let created = 0, updated = 0, skipped = 0;

  const posts = await wpQuery<any>(
    `SELECT ID, post_title, post_name FROM ${p}posts WHERE post_type = 'auteurs' AND post_status IN ('publish','draft') ORDER BY ID DESC LIMIT ?`,
    [limit]
  );
  const ids = posts.map((x) => Number(x.ID));
  const meta = ids.length ? metaIndex(await wpQuery<any>(
    `SELECT post_id, meta_key, meta_value FROM ${p}postmeta WHERE post_id IN (${ids.map(() => '?').join(',')}) AND meta_key IN ('prenom','nom')`,
    [...ids]
  ), 'post_id') : new Map();

  for (const a of posts) {
    const wpId = Number(a.ID);
    const m = meta.get(wpId) ?? {};
    // Cohérent avec migrate-catalogue : first_name = prenom, last_name = nom (sinon titre).
    const first = (m.prenom || '').trim();
    const last = (m.nom || '').trim() || String(a.post_title || '').trim();
    try {
      const ex = await query<any>(`SELECT meta::id(id) AS pid FROM author WHERE legacy_wp_id = $w LIMIT 1`, { w: wpId });
      if (dryRun) { ex[0]?.pid ? updated++ : created++; continue; }
      if (ex[0]?.pid) {
        await query(`UPDATE $id SET first_name = $f, last_name = $l`, { id: recId('author', ex[0].pid), f: first, l: last });
        updated++;
      } else {
        const slug = await uniqueSlug('author', a.post_name || `${first} ${last}`);
        const { sql, vars } = buildSet({ first_name: first, last_name: last, slug, legacy_wp_id: wpId });
        await query(`CREATE author SET ${sql}`, vars);
        created++;
      }
    } catch (e) {
      skipped++;
      warnings.push(`Auteur WP #${wpId} ignoré : ${e instanceof Error ? e.message.split('\n')[0] : 'erreur'}`);
    }
  }
  return { type: 'authors', fetched: posts.length, created, updated, skipped, warnings: warnings.slice(0, 20), dryRun };
}

/* ————————————————————— Articles (L'Antichambre) ————————————————————— */

export async function importArticles(opts: { limit?: number; dryRun?: boolean } = {}): Promise<ImportResult> {
  const limit = Math.min(Math.max(1, opts.limit ?? 100), 5000);
  const dryRun = !!opts.dryRun;
  const p = wpPrefix();
  const warnings: string[] = [];
  let created = 0, updated = 0, skipped = 0;

  const posts = await wpQuery<any>(
    `SELECT ID, post_title, post_name, post_content, post_excerpt, post_status, post_date_gmt
       FROM ${p}posts WHERE post_type = 'post' AND post_status IN ('publish','draft') ORDER BY ID DESC LIMIT ?`,
    [limit]
  );
  const ids = posts.map((x) => Number(x.ID));
  const meta = ids.length ? metaIndex(await wpQuery<any>(
    `SELECT post_id, meta_key, meta_value FROM ${p}postmeta WHERE post_id IN (${ids.map(() => '?').join(',')}) AND meta_key IN ('auteurs_associes','livres_associes')`,
    [...ids]
  ), 'post_id') : new Map();
  const catByPost = await firstTermByPost(p, ids, 'category');
  // Vues totales (plugin Post Views Counter : type=4, period='total').
  const viewsMap = new Map<number, number>();
  if (ids.length) {
    const vr = await wpQuery<any>(`SELECT id, count FROM ${p}post_views WHERE type = 4 AND period = 'total' AND id IN (${ids.map(() => '?').join(',')})`, [...ids]);
    for (const r of vr) viewsMap.set(Number(r.id), Number(r.count) || 0);
  }
  const [authMap, rubMap, bookMap] = await Promise.all([legacyMap('author'), legacyMap('rubrique', 'legacy_term_id'), legacyMap('book')]);

  for (const a of posts) {
    const wpId = Number(a.ID);
    const m = meta.get(wpId) ?? {};
    const authorIds = parseWpIds(m.auteurs_associes).map((x) => authMap.get(x)).filter(Boolean) as string[];
    const bookIds = parseWpIds(m.livres_associes).map((x) => bookMap.get(x)).filter(Boolean) as string[];
    const rubPid = rubMap.get(catByPost.get(wpId) ?? -1);
    const excerpt = stripHtml(a.post_excerpt) || stripHtml(a.post_content).slice(0, 220) || undefined;
    try {
      const ex = await query<any>(`SELECT meta::id(id) AS pid FROM article WHERE legacy_wp_id = $w LIMIT 1`, { w: wpId });
      if (dryRun) { ex[0]?.pid ? updated++ : created++; continue; }
      const fields = {
        title: String(a.post_title || '').trim() || '(sans titre)',
        body_html: wpautop(a.post_content) || undefined,
        excerpt,
        status: a.post_status === 'draft' ? 'draft' : 'published',
        is_newsletter_issue: /\[\s*lettrinfo/i.test(String(a.post_title || '')),
        published_at: mysqlDate(a.post_date_gmt),
        rubrique: rubPid ? recId('rubrique', rubPid) : undefined,
        authors: authorIds.length ? authorIds.map((id) => recId('author', id)) : undefined,
        books: bookIds.length ? bookIds.map((id) => recId('book', id)) : undefined,
        views: viewsMap.get(wpId) ?? 0
      };
      if (ex[0]?.pid) {
        const { sql, vars } = buildSet(fields);
        await query(`UPDATE $id SET ${sql}`, { ...vars, id: recId('article', ex[0].pid) });
        updated++;
      } else {
        const slug = await uniqueSlug('article', a.post_name || String(a.post_title || 'article'));
        const { sql, vars } = buildSet({ ...fields, slug, legacy_wp_id: wpId });
        await query(`CREATE article SET ${sql}`, vars);
        created++;
      }
    } catch (e) {
      skipped++;
      warnings.push(`Article WP #${wpId} ignoré : ${e instanceof Error ? e.message.split('\n')[0] : 'erreur'}`);
    }
  }
  return { type: 'articles', fetched: posts.length, created, updated, skipped, warnings: warnings.slice(0, 20), dryRun };
}

/* ————————————————————— Livres (+ contributions) ————————————————————— */

const BOOK_META = [
  'sous_titre', 'infos_additionnelles', 'titre_originale', 'langue_originale',
  'isbn_papier', 'isbn_digital', 'prix_papier', 'prix_digital', 'tarif_souscription',
  'nombre_de_pages', 'date_de_publication', 'qte_stock', 'focus',
  'livre_auteurs', 'livre_traducteurs', 'livre_auteurs_preface', 'livre_auteurs_postface', 'livre_auteurs_divers'
];
const ROLE_FIELDS: [string, string][] = [
  ['livre_auteurs', 'author'], ['livre_traducteurs', 'translator'],
  ['livre_auteurs_preface', 'preface'], ['livre_auteurs_postface', 'postface'], ['livre_auteurs_divers', 'other']
];

export async function importBooks(opts: { limit?: number; dryRun?: boolean } = {}): Promise<ImportResult> {
  const limit = Math.min(Math.max(1, opts.limit ?? 100), 5000);
  const dryRun = !!opts.dryRun;
  const p = wpPrefix();
  const warnings: string[] = [];
  let created = 0, updated = 0, skipped = 0;

  const posts = await wpQuery<any>(
    `SELECT ID, post_title, post_name, post_content, post_status FROM ${p}posts
       WHERE post_type = 'livres' AND post_status IN ('publish','draft') ORDER BY ID DESC LIMIT ?`,
    [limit]
  );
  const ids = posts.map((x) => Number(x.ID));
  const meta = ids.length ? metaIndex(await wpQuery<any>(
    `SELECT post_id, meta_key, meta_value FROM ${p}postmeta WHERE post_id IN (${ids.map(() => '?').join(',')}) AND meta_key IN (${BOOK_META.map(() => '?').join(',')})`,
    [...ids, ...BOOK_META]
  ), 'post_id') : new Map();
  const authMap = await legacyMap('author');

  for (const b of posts) {
    const wpId = Number(b.ID);
    const m = meta.get(wpId) ?? {};
    const pubDate = wpDate8(m.date_de_publication);
    const fields = {
      title: String(b.post_title || '').trim() || '(sans titre)',
      subtitle: (m.sous_titre || '').trim() || undefined,
      description_html: wpautop(b.post_content) || undefined,
      extra_info_html: wpautop((m.infos_additionnelles || '').trim()) || undefined,
      title_original: (m.titre_originale || '').trim() || undefined,
      language_original: (m.langue_originale || '').trim() || undefined,
      // Brouillon WP → draft ; sinon published (une date de parution future le rend « à paraître »).
      status: b.post_status === 'draft' ? 'draft' : 'published',
      isbn_paper: (m.isbn_papier || '').trim() || undefined,
      isbn_ebook: (m.isbn_digital || '').trim() || undefined,
      price_paper: num(m.prix_papier),
      price_ebook: num(m.prix_digital),
      subscription_price: num(m.tarif_souscription),
      published_at: pubDate,
      page_count: num(m.nombre_de_pages) != null ? Math.round(num(m.nombre_de_pages)!) : undefined,
      stock_qty: num(m.qte_stock) != null ? Math.round(num(m.qte_stock)!) : 0,
      featured: ['1', 'true', 'yes', 'on'].includes(String(m.focus ?? '').toLowerCase())
    };
    try {
      const ex = await query<any>(`SELECT meta::id(id) AS pid FROM book WHERE legacy_wp_id = $w LIMIT 1`, { w: wpId });
      if (dryRun) { ex[0]?.pid ? updated++ : created++; continue; }
      let bookPid: string;
      if (ex[0]?.pid) {
        bookPid = ex[0].pid;
        const { sql, vars } = buildSet(fields);
        await query(`UPDATE $id SET ${sql}`, { ...vars, id: recId('book', bookPid) });
        updated++;
      } else {
        const slug = await uniqueSlug('book', b.post_name || fields.title);
        const { sql, vars } = buildSet({ ...fields, slug, legacy_wp_id: wpId });
        const rows = await query<any>(`CREATE book SET ${sql}`, vars);
        bookPid = String(rows[0].id).replace(/^book:/, '');
        created++;
      }
      // Contributions (arêtes typées) : on resynchronise.
      await query(`DELETE contributed_by WHERE in = $b`, { b: recId('book', bookPid) });
      for (const [field, role] of ROLE_FIELDS) {
        const aids = parseWpIds(m[field]);
        for (let i = 0; i < aids.length; i++) {
          const aPid = authMap.get(aids[i]);
          if (!aPid) continue;
          await query(`RELATE $b->contributed_by->$a SET role = $role, position = $pos, share = 100`,
            { b: recId('book', bookPid), a: recId('author', aPid), role, pos: i });
        }
      }
    } catch (e) {
      skipped++;
      warnings.push(`Livre WP #${wpId} ignoré : ${e instanceof Error ? e.message.split('\n')[0] : 'erreur'}`);
    }
  }
  return { type: 'books', fetched: posts.length, created, updated, skipped, warnings: warnings.slice(0, 20), dryRun };
}

/* ————————————————————— Rencontres (+ lieux) ————————————————————— */

async function ensureVenue(lieu: string | undefined, cache: Map<string, string>): Promise<string | undefined> {
  if (!lieu || !lieu.includes('name')) return undefined;
  const name = phpField(lieu, 'name');
  if (!name) return undefined;
  const city = phpField(lieu, 'city');
  const placeId = phpField(lieu, 'place_id');
  const key = placeId || slugify(`${name}-${city ?? ''}`) || slugify(name);
  if (cache.has(key)) return cache.get(key);

  // Cherche un lieu existant (dédup par place_id, sinon par slug).
  let existing: any[] = [];
  if (placeId) existing = await query<any>(`SELECT meta::id(id) AS pid FROM venue WHERE place_id = $p LIMIT 1`, { p: placeId });
  const slug = await (async () => {
    const base = slugify(`${name}-${city ?? ''}`) || slugify(name) || 'lieu';
    return existing[0]?.pid ? base : uniqueSlug('venue', base);
  })();
  if (!existing[0]?.pid) existing = await query<any>(`SELECT meta::id(id) AS pid FROM venue WHERE slug = $s LIMIT 1`, { s: slug });

  if (existing[0]?.pid) { cache.set(key, existing[0].pid); return existing[0].pid; }

  const lat = num(phpField(lieu, 'lat'));
  const lng = num(phpField(lieu, 'lng'));
  const street = [phpField(lieu, 'street_number'), phpField(lieu, 'street_name')].filter(Boolean).join(' ') || undefined;
  const content: Record<string, unknown> = {
    name, slug, address: phpField(lieu, 'address'), street, city,
    post_code: phpField(lieu, 'post_code'), state: phpField(lieu, 'state'),
    country: phpField(lieu, 'country'), country_short: phpField(lieu, 'country_short'),
    lat, lng, place_id: placeId
  };
  if (lat != null && lng != null) content.geo = new GeometryPoint([lng, lat]);
  for (const k of Object.keys(content)) if (content[k] === undefined) delete content[k];
  const rows = await query<any>(`CREATE venue CONTENT $c`, { c: content });
  const pid = String(rows[0].id).replace(/^venue:/, '');
  cache.set(key, pid);
  return pid;
}

export async function importEvents(opts: { limit?: number; dryRun?: boolean } = {}): Promise<ImportResult> {
  const limit = Math.min(Math.max(1, opts.limit ?? 100), 5000);
  const dryRun = !!opts.dryRun;
  const p = wpPrefix();
  const warnings: string[] = [];
  let created = 0, updated = 0, skipped = 0;

  const posts = await wpQuery<any>(
    `SELECT ID, post_title, post_name, post_content FROM ${p}posts
       WHERE post_type = 'rencontres' AND post_status IN ('publish','draft') ORDER BY ID DESC LIMIT ?`,
    [limit]
  );
  const ids = posts.map((x) => Number(x.ID));
  const meta = ids.length ? metaIndex(await wpQuery<any>(
    `SELECT post_id, meta_key, meta_value FROM ${p}postmeta WHERE post_id IN (${ids.map(() => '?').join(',')}) AND meta_key IN ('date_de_debut','date_de_fin','lieu','auteurs_associes','livres_associes')`,
    [...ids]
  ), 'post_id') : new Map();
  const [authMap, bookMap] = await Promise.all([legacyMap('author'), legacyMap('book')]);
  const venueCache = new Map<string, string>();

  for (const e of posts) {
    const wpId = Number(e.ID);
    const m = meta.get(wpId) ?? {};
    try {
      const authors = parseWpIds(m.auteurs_associes).map((x) => authMap.get(x)).filter(Boolean).map((id) => recId('author', id as string));
      const books = parseWpIds(m.livres_associes).map((x) => bookMap.get(x)).filter(Boolean).map((id) => recId('book', id as string));
      const venuePid = dryRun ? undefined : await ensureVenue(m.lieu, venueCache);
      const fields = {
        title: String(e.post_title || '').trim() || '(sans titre)',
        body_html: e.post_content || undefined,
        start_at: mysqlDate(m.date_de_debut),
        end_at: mysqlDate(m.date_de_fin),
        venue: venuePid ? recId('venue', venuePid) : undefined,
        authors: authors.length ? authors : undefined,
        books: books.length ? books : undefined
      };
      const ex = await query<any>(`SELECT meta::id(id) AS pid FROM event WHERE legacy_wp_id = $w LIMIT 1`, { w: wpId });
      if (dryRun) { ex[0]?.pid ? updated++ : created++; continue; }
      if (ex[0]?.pid) {
        const { sql, vars } = buildSet(fields);
        await query(`UPDATE $id SET ${sql}`, { ...vars, id: recId('event', ex[0].pid) });
        updated++;
      } else {
        const slug = await uniqueSlug('event', e.post_name || fields.title);
        const { sql, vars } = buildSet({ ...fields, slug, legacy_wp_id: wpId });
        await query(`CREATE event SET ${sql}`, vars);
        created++;
      }
    } catch (err) {
      skipped++;
      warnings.push(`Rencontre WP #${wpId} ignorée : ${err instanceof Error ? err.message.split('\n')[0] : 'erreur'}`);
    }
  }
  return { type: 'events', fetched: posts.length, created, updated, skipped, warnings: warnings.slice(0, 20), dryRun };
}
