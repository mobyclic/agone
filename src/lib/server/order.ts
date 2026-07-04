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
