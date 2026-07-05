/**
 * Commandes — création, numérotation, paiement, bibliothèque ebook.
 */
import { query, recId } from './surreal';
import type { CartLine } from './cart';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Incrément atomique d'un compteur (site_setting key='counters'). */
async function nextCounter(field: 'order_number' | 'invoice_number', start: number): Promise<number> {
  const rows = await query<any>(
    `UPDATE site_setting SET value.${field} = (value.${field} ?? ${start}) + 1 WHERE key = 'counters' RETURN AFTER`
  );
  if (rows[0]?.value?.[field] != null) return rows[0].value[field];
  await query(`CREATE site_setting CONTENT { key: 'counters', value: { ${field}: ${start + 1} } }`);
  return start + 1;
}

export interface CreateOrderInput {
  customerId: string;
  email?: string;
  billing?: Record<string, unknown>;
  shipping?: Record<string, unknown>;
  lines: CartLine[];
}

export async function createOrder(input: CreateOrderInput): Promise<{ id: string; number: number }> {
  const number = await nextCounter('order_number', 1000);
  let subtotal = 0, item_count = 0, has_ebook = false, has_physical = false;
  for (const l of input.lines) {
    subtotal += l.line_total; item_count += l.qty;
    if (l.format === 'epub') has_ebook = true; else has_physical = true;
  }
  const shipping_total = 0; // Livraison offerte (France métropolitaine)
  const total = r2(subtotal + shipping_total);

  const rows = await query<any>(`CREATE order CONTENT $c`, {
    c: {
      number, customer: recId('user', input.customerId), email: input.email,
      status: 'pending', billing: input.billing, shipping: input.shipping,
      item_count, subtotal: r2(subtotal), shipping_total, total, has_ebook, has_physical
    }
  });
  const orderId = String(rows[0].id).replace(/^order:/, '');

  for (const l of input.lines) {
    await query(
      `RELATE $o->contains->$b SET format = $format, qty = $qty, unit_price = $unit_price, line_total = $line_total, title_snapshot = $title`,
      { o: recId('order', orderId), b: recId('book', l.id), format: l.format, qty: l.qty, unit_price: l.unit_price, line_total: l.line_total, title: l.title }
    );
  }
  return { id: orderId, number };
}

/** Marque une commande payée + accorde les ebooks (bibliothèque) + numéro de facture. */
export async function markOrderPaid(orderId: string): Promise<void> {
  const rows = await query<any>(`SELECT id, status, customer, has_ebook FROM order WHERE id = $id LIMIT 1`, { id: recId('order', orderId) });
  const order = rows[0];
  if (!order || order.status === 'paid' || order.status === 'completed') return;
  const invoice = await nextCounter('invoice_number', 0);
  await query(`UPDATE $id SET status = 'paid', paid_at = time::now(), invoice_number = $inv`, { id: recId('order', orderId), inv: invoice });

  if (order.customer && order.has_ebook) {
    const ebookLines = await query<any>(`SELECT out AS book FROM contains WHERE in = $id AND format = 'epub'`, { id: recId('order', orderId) });
    const userId = String(order.customer).replace(/^user:/, '');
    for (const l of ebookLines) {
      const asset = (await query<any>(`SELECT id FROM ebook_asset WHERE book = $b AND status = 'available' LIMIT 1`, { b: recId('book', String(l.book)) }))[0];
      if (!asset) continue;
      const already = await query<any>(`SELECT id FROM owns WHERE in = $u AND out = $a LIMIT 1`, { u: recId('user', userId), a: recId('ebook_asset', String(asset.id)) });
      if (already.length) continue;
      await query(`RELATE $u->owns->$a SET order = $o`, { u: recId('user', userId), a: recId('ebook_asset', String(asset.id)), o: recId('order', orderId) });
    }
  }
}

const ORDER_FIELDS = `
  id, number, status, total, subtotal, shipping_total, item_count, has_ebook, has_physical,
  invoice_number, created_at, paid_at, billing, shipping, email
`;

export async function getOrderByNumber(number: number) {
  const rows = await query<any>(`SELECT ${ORDER_FIELDS}, customer FROM order WHERE number = $n LIMIT 1`, { n: number });
  const o = rows[0];
  if (!o) return null;
  const lines = await query<any>(
    `SELECT out.title AS title, out.slug AS slug, format, qty, unit_price, line_total FROM contains WHERE in = $id`,
    { id: recId('order', String(o.id)) }
  );
  return { ...o, lines };
}

export async function listOrdersForUser(userId: string) {
  return query<any>(
    `SELECT ${ORDER_FIELDS} FROM order WHERE customer = $u ORDER BY created_at DESC`,
    { u: recId('user', userId) }
  );
}

/* ————————————————————— Back-office ————————————————————— */

export const ORDER_STATUSES = [
  'pending', 'paid', 'processing', 'sent_to_bl', 'completed', 'cancelled', 'refunded', 'failed'
] as const;

const PAID_LIKE = new Set(['paid', 'processing', 'sent_to_bl', 'completed']);

export interface OrderStats { orders: number; revenue: number; pending: number; toShip: number }

/** Indicateurs commandes pour le tableau de bord. */
export async function orderStats(): Promise<OrderStats> {
  const rows = await query<any>(`SELECT status, count() AS n, math::sum(total) AS rev FROM order GROUP BY status`);
  let orders = 0, revenue = 0, pending = 0, toShip = 0;
  for (const r of rows) {
    const n = r.n ?? 0;
    orders += n;
    if (PAID_LIKE.has(r.status)) revenue += r.rev ?? 0;
    if (r.status === 'pending') pending += n;
    if (r.status === 'paid' || r.status === 'processing') toShip += n;
  }
  return { orders, revenue: r2(revenue), pending, toShip };
}

/** Liste paginée des commandes (back-office), recherche par n° ou client. */
export async function listOrdersAdmin(opts: { q?: string; status?: string; limit?: number; offset?: number } = {}) {
  const where: string[] = [];
  const vars: Record<string, unknown> = { limit: opts.limit ?? 50, start: opts.offset ?? 0 };
  if (opts.status) { where.push('status = $status'); vars.status = opts.status; }
  if (opts.q && opts.q.trim()) {
    const q = opts.q.trim();
    if (/^\d+$/.test(q)) { where.push('number = $num'); vars.num = Number(q); }
    else {
      vars.q = q;
      where.push('(email CONTAINS $q OR customer.email CONTAINS $q OR customer.full_name CONTAINS $q)');
    }
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await query<any>(
    `SELECT number, status, total, item_count, has_ebook, has_physical, created_at, paid_at, email,
       customer.full_name AS customer_name, customer.email AS customer_email
     FROM order ${whereSql} ORDER BY created_at DESC LIMIT $limit START $start`,
    vars
  );
  const count = await query<any>(`SELECT count() AS n FROM order ${whereSql} GROUP ALL`, vars);
  return { orders: rows, total: count[0]?.n ?? 0 };
}

/** Change le statut d'une commande (par numéro), horodatage selon l'état. */
export async function setOrderStatus(number: number, status: string): Promise<void> {
  const extra =
    status === 'completed' ? ', completed_at = time::now()' :
    status === 'paid' ? ', paid_at = time::now()' : '';
  await query(`UPDATE order SET status = $s${extra} WHERE number = $n`, { s: status, n: number });
}
