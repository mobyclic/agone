/**
 * Commandes — création, numérotation, paiement, bibliothèque ebook.
 */
import { query, recId } from './surreal';
import type { CartLine } from './cart';
import { findUserByEmail, createUser } from './account';
import { createInvoiceForOrder } from './invoice';
import { recordPromoUse } from './promo';

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
  customerId?: string;
  email?: string;
  channel?: string;
  billing?: Record<string, unknown>;
  shipping?: Record<string, unknown>;
  lines: CartLine[];
  discount?: number;
  promoCode?: string;
  shippingTotal?: number;
}

export async function createOrder(input: CreateOrderInput): Promise<{ id: string; number: number }> {
  const number = await nextCounter('order_number', 1000);
  let subtotal = 0, item_count = 0, has_ebook = false, has_physical = false;
  for (const l of input.lines) {
    subtotal += l.line_total; item_count += l.qty;
    if (l.format === 'epub') has_ebook = true; else has_physical = true;
  }
  const shipping_total = r2(Math.max(0, input.shippingTotal ?? 0));
  const discount_total = r2(Math.min(Math.max(0, input.discount ?? 0), subtotal));
  const total = r2(subtotal - discount_total + shipping_total);

  const rows = await query<any>(`CREATE order CONTENT $c`, {
    c: {
      number,
      customer: input.customerId ? recId('user', input.customerId) : undefined,
      email: input.email, channel: input.channel ?? 'web',
      status: 'pending', billing: input.billing, shipping: input.shipping,
      item_count, subtotal: r2(subtotal), shipping_total, discount_total,
      promo_code: input.promoCode || undefined, total, has_ebook, has_physical
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
  const rows = await query<any>(`SELECT id, status, customer, has_ebook, promo_code FROM order WHERE id = $id LIMIT 1`, { id: recId('order', orderId) });
  const order = rows[0];
  if (!order || order.status === 'paid' || order.status === 'completed') return;
  const invoice = await nextCounter('invoice_number', 0);
  await query(`UPDATE $id SET status = 'paid', paid_at = time::now(), invoice_number = $inv`, { id: recId('order', orderId), inv: invoice });
  if (order.promo_code) await recordPromoUse(order.promo_code);

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

  // Facture (idempotente). Best-effort : ne bloque pas le paiement en cas d'échec.
  try {
    await createInvoiceForOrder(orderId);
  } catch (e) {
    console.error('[invoice] génération échouée pour la commande', orderId, e);
  }

  // Confirmation au client — après la facture, pour qu'elle existe quand il clique.
  // Jamais bloquant : un email qui échoue ne doit pas défaire un paiement.
  try {
    const { sendOrderConfirmation } = await import('./orderMail');
    await sendOrderConfirmation(orderId);
  } catch (e) {
    console.error('[mail] confirmation de commande', orderId, e);
  }
}

const ORDER_FIELDS = `
  id, number, status, channel, total, subtotal, shipping_total, discount_total, promo_code,
  item_count, has_ebook, has_physical, invoice_number, created_at, paid_at, billing, shipping, email,
  carrier, tracking_number, tracking_url, shipped_at, notes,
  confirmation_sent_at, shipping_notified_at, stripe_payment_intent, stripe_refund_id, refunded_at
`;

export async function getOrderByNumber(number: number) {
  const rows = await query<any>(`SELECT ${ORDER_FIELDS}, customer FROM order WHERE number = $n LIMIT 1`, { n: number });
  const o = rows[0];
  if (!o) return null;
  const lines = await query<any>(
    `SELECT out AS book_id, out.title AS title, out.slug AS slug, format, qty, unit_price, line_total FROM contains WHERE in = $id`,
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

/** Slugs des livres déjà achetés par un client (via order->contains->book).
 *  Indexé par idx_order_customer ; sert à ne pas re-suggérer ce qu'il possède. */
export async function purchasedBookSlugs(userId: string): Promise<string[]> {
  const rows = await query<any>(
    `SELECT ->contains->book.slug AS slugs FROM order WHERE customer = $u`,
    { u: recId('user', userId) }
  );
  return [...new Set(rows.flatMap((r) => (r.slugs ?? []) as string[]))];
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
export async function listOrdersAdmin(opts: { q?: string; status?: string; type?: string; limit?: number; offset?: number } = {}) {
  const where: string[] = [];
  const vars: Record<string, unknown> = { limit: opts.limit ?? 50, start: opts.offset ?? 0 };
  if (opts.status) { where.push('status = $status'); vars.status = opts.status; }
  // Invité = commande sans compte client rattaché.
  if (opts.type === 'invites') where.push('customer = NONE');
  else if (opts.type === 'clients') where.push('customer != NONE');
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
       customer.full_name AS customer_name, customer.email AS customer_email, customer != NONE AS has_account,
       billing.first_name AS b_first, billing.last_name AS b_last
     FROM order ${whereSql} ORDER BY created_at DESC LIMIT $limit START $start`,
    vars
  );
  const count = await query<any>(`SELECT count() AS n FROM order ${whereSql} GROUP ALL`, vars);
  return { orders: rows, total: count[0]?.n ?? 0 };
}

/**
 * Change le statut d'une commande (par numéro), horodatage selon l'état.
 * Passer une commande papier en « terminée » prévient le client que son colis
 * est parti (une seule fois, cf. shipping_notified_at).
 */
export async function setOrderStatus(number: number, status: string): Promise<void> {
  const extra =
    status === 'completed' ? ', completed_at = time::now()' :
    status === 'paid' ? ', paid_at = time::now()' : '';
  await query(`UPDATE order SET status = $s${extra} WHERE number = $n`, { s: status, n: number });
  if (status === 'completed') {
    const o = (await query<any>(`SELECT meta::id(id) AS id, has_physical, email, created_at FROM order WHERE number = $n LIMIT 1`, { n: number }))[0];
    // Garde-fou : reclasser une vieille commande migrée ne doit pas annoncer un
    // colis à un client d'il y a trois ans. Au-delà de 60 jours, rien ne part
    // automatiquement (le bouton « prévenir » de la fiche reste disponible).
    const recente = o?.created_at && Date.now() - +new Date(o.created_at) < 60 * 86_400_000;
    if (o?.has_physical && o.email && recente) {
      try {
        const { sendShippingNotice } = await import('./orderMail');
        await sendShippingNotice(o.id);
      } catch (e) {
        console.error('[mail] avis d’expédition', number, e);
      }
    }
  }
}

/* ————————————————————— Expédition, notes, remboursement ————————————————————— */

/** Transporteurs usuels et gabarit d'adresse de suivi (le numéro remplace {n}). */
export const TRANSPORTEURS: Record<string, { nom: string; suivi?: string }> = {
  colissimo: { nom: 'Colissimo', suivi: 'https://www.laposte.fr/outils/suivre-vos-envois?code={n}' },
  lettre_suivie: { nom: 'Lettre suivie', suivi: 'https://www.laposte.fr/outils/suivre-vos-envois?code={n}' },
  chronopost: { nom: 'Chronopost', suivi: 'https://www.chronopost.fr/tracking-no-cms/suivi-page?listeNumerosLT={n}' },
  mondial_relay: { nom: 'Mondial Relay', suivi: 'https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition={n}' },
  dhl: { nom: 'DHL', suivi: 'https://www.dhl.com/fr-fr/home/tracking.html?tracking-id={n}' },
  ups: { nom: 'UPS', suivi: 'https://www.ups.com/track?tracknum={n}' },
  autre: { nom: 'Autre' }
};

/** Enregistre le suivi ; `prevenir` envoie l'avis d'expédition (à nouveau si demandé). */
export async function setOrderTracking(
  number: number,
  d: { carrier?: string; tracking_number?: string; tracking_url?: string },
  prevenir: boolean
): Promise<{ ok: boolean; error?: string }> {
  const numero = (d.tracking_number ?? '').trim();
  const transporteur = d.carrier && TRANSPORTEURS[d.carrier] ? d.carrier : undefined;
  const gabarit = transporteur ? TRANSPORTEURS[transporteur].suivi : undefined;
  const url = (d.tracking_url ?? '').trim() || (numero && gabarit ? gabarit.replace('{n}', encodeURIComponent(numero)) : '');
  await query(
    `UPDATE order SET carrier = $c, tracking_number = $t, tracking_url = $u, shipped_at = shipped_at ?? time::now() WHERE number = $n`,
    { c: transporteur ? TRANSPORTEURS[transporteur].nom : undefined, t: numero || undefined, u: url || undefined, n: number }
  );
  if (!prevenir) return { ok: true };
  const o = (await query<any>(`SELECT meta::id(id) AS id FROM order WHERE number = $n LIMIT 1`, { n: number }))[0];
  const { sendShippingNotice } = await import('./orderMail');
  return sendShippingNotice(o.id, { force: true });
}

export const setOrderNotes = (number: number, notes: string) =>
  query(`UPDATE order SET notes = $v WHERE number = $n`, { v: notes.trim() || undefined, n: number });

/**
 * Rembourse via Stripe (tout ou partie) puis passe la commande en « remboursée »
 * si le remboursement est total. Les commandes hors Stripe (comptoir, virement)
 * se remboursent à la main : on ne fait que consigner.
 */
export async function refundOrder(number: number, montant?: number): Promise<{ ok: boolean; error?: string; montant: number }> {
  const o = (await query<any>(
    `SELECT meta::id(id) AS id, total, status, stripe_payment_intent, stripe_session, stripe_refund_id FROM order WHERE number = $n LIMIT 1`, { n: number }
  ))[0];
  if (!o) return { ok: false, error: 'Commande introuvable.', montant: 0 };
  if (o.stripe_refund_id) return { ok: false, error: 'Déjà remboursée via Stripe.', montant: 0 };
  const somme = r2(montant && montant > 0 ? Math.min(montant, o.total) : o.total);
  if (somme <= 0) return { ok: false, error: 'Montant nul.', montant: 0 };

  const { getStripe } = await import('./stripe');
  const stripe = getStripe();
  let refundId: string | undefined;
  if (stripe && (o.stripe_payment_intent || o.stripe_session)) {
    let pi = o.stripe_payment_intent as string | undefined;
    if (!pi && o.stripe_session) {
      const session = await stripe.checkout.sessions.retrieve(o.stripe_session);
      pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    }
    if (!pi) return { ok: false, error: 'Paiement Stripe introuvable pour cette commande.', montant: 0 };
    const refund = await stripe.refunds.create({ payment_intent: pi, amount: Math.round(somme * 100) });
    refundId = refund.id;
  }
  const total = somme >= o.total - 0.005;
  await query(
    `UPDATE $id SET stripe_refund_id = $r, refunded_at = time::now()${total ? ", status = 'refunded'" : ''}`,
    { id: recId('order', o.id), r: refundId ?? `manuel-${Date.now()}` }
  );
  try {
    const { sendRefundNotice } = await import('./orderMail');
    await sendRefundNotice(o.id, somme);
  } catch (e) {
    console.error('[mail] avis de remboursement', number, e);
  }
  return { ok: true, montant: somme };
}

/* ————————————————————— Commande rapide (back-office) ————————————————————— */

export interface AdminOrderLine {
  bookId: string;
  title: string;
  format: 'papier' | 'epub' | 'souscription';
  qty: number;
  unit_price: number; // TTC ; 0 = livre offert
}

export interface AdminOrderInput {
  customerId?: string;
  newCustomer?: { first_name?: string; last_name?: string; email: string };
  channel: string; // 'comptoir' | 'vpc' | 'sortie_editeur'
  status?: string; // statut initial (défaut 'paid')
  billing?: Record<string, unknown>;
  shipping?: Record<string, unknown>;
  lines: AdminOrderLine[];
}

/**
 * Crée une commande depuis le back-office : client existant OU nouveau (créé à la
 * volée), lignes gratuites ou payantes, canal (comptoir/vpc/sortie éditeur), statut
 * initial. Un statut « payé/traité/… » déclenche la numérotation de facture (markOrderPaid).
 */
export async function createAdminOrder(input: AdminOrderInput): Promise<{ id: string; number: number }> {
  // 1) Résoudre / créer le client.
  let customerId = input.customerId;
  let email: string | undefined;
  if (!customerId && input.newCustomer?.email) {
    const existing = await findUserByEmail(input.newCustomer.email);
    customerId = existing
      ? String(existing.id).replace(/^user:/, '')
      : await createUser({
          email: input.newCustomer.email,
          first_name: input.newCustomer.first_name,
          last_name: input.newCustomer.last_name,
          role: 'customer'
        });
    email = input.newCustomer.email.toLowerCase();
  } else if (customerId) {
    const u = (await query<any>(`SELECT email FROM $id`, { id: recId('user', customerId) }))[0];
    email = u?.email ?? undefined;
  }

  // 2) Lignes (line_total = qty × prix unitaire ; 0 possible).
  const lines: CartLine[] = input.lines
    .filter((l) => l.bookId && l.qty > 0)
    .map((l) => ({
      id: l.bookId,
      slug: '',
      title: l.title,
      format: l.format,
      qty: l.qty,
      unit_price: r2(l.unit_price),
      line_total: r2(l.qty * l.unit_price)
    }));

  const { id, number } = await createOrder({
    customerId, email, channel: input.channel,
    billing: input.billing, shipping: input.shipping, lines
  });

  // 3) Statut initial (défaut : payé → facture émise).
  const status = input.status ?? 'paid';
  if (status !== 'pending') {
    if (PAID_LIKE.has(status)) {
      await markOrderPaid(id);
      if (status !== 'paid') await setOrderStatus(number, status);
    } else {
      await setOrderStatus(number, status);
    }
  }
  return { id, number };
}
