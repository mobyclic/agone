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
import { query, recId } from './surreal';
import { uniqueSlug } from './slug';
import { wpQuery, wpPrefix } from './wp-db';

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
      if (existing) {
        const fields: Record<string, unknown> = { legacy_wp_id: wpId, first_name: first, last_name: last, phone, billing, shipping };
        if (createdAt) fields.created_at = createdAt; // backfill de la vraie date d'inscription
        const { sql, vars } = buildSet(fields);
        await query(`UPDATE $id SET ${sql}`, { ...vars, id: recId('user', existing) });
        updated++;
      } else {
        const slug = await uniqueSlug('user', full || email);
        const { sql, vars } = buildSet({
          email, first_name: first, last_name: last, slug,
          role: 'customer', email_verified: true, is_active: true, legacy_wp_id: wpId,
          phone, billing, shipping, created_at: createdAt
        });
        await query(`CREATE user SET ${sql}`, vars);
        created++;
      }
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

    const customerPid = userMap.get(Number(m._customer_user ?? 0));
    const { sql, vars } = buildSet({
      number: wpId, legacy_wp_id: wpId, status,
      customer: customerPid ? recId('user', customerPid) : undefined,
      email: (m._billing_email || '').trim() || undefined,
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
