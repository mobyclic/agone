/**
 * Statistiques de ventes (back-office).
 *
 * CA = somme des `order.total` (livraison gratuite → total = sous-total) pour les
 * commandes encaissées. Les unités/CA par livre viennent des arêtes `contains`
 * (order->book). Toutes les bornes de date passent par type::datetime($iso).
 */
import { query } from './surreal';

/** Statuts comptés comme « ventes encaissées ». */
const PAID = "['completed','paid','processing','sent_to_bl']";

export interface YearRow { period: number; orders: number; units: number; ca: number }

function fmtISO(d: Date): string {
  return d.toISOString();
}

/** Ventes par année. Si `bookSlug`, restreint à un livre. */
export async function salesByYear(bookSlug?: string): Promise<YearRow[]> {
  if (bookSlug) {
    const rows = await query<any>(
      `SELECT time::year(in.created_at) AS period, count() AS orders, math::sum(qty) AS units, math::sum(line_total) AS ca
         FROM contains WHERE in.status IN ${PAID} AND out.slug = $s GROUP BY period ORDER BY period DESC`,
      { s: bookSlug }
    );
    return rows.map((r) => ({ period: r.period, orders: r.orders ?? 0, units: r.units ?? 0, ca: r.ca ?? 0 }));
  }
  const orders = await query<any>(
    `SELECT time::year(created_at) AS period, count() AS orders, math::sum(total) AS ca
       FROM order WHERE status IN ${PAID} GROUP BY period ORDER BY period DESC`
  );
  const units = await query<any>(
    `SELECT time::year(in.created_at) AS period, math::sum(qty) AS units FROM contains WHERE in.status IN ${PAID} GROUP BY period`
  );
  const uByYear = new Map<number, number>();
  for (const u of units) uByYear.set(u.period, u.units ?? 0);
  return orders.map((r) => ({ period: r.period, orders: r.orders ?? 0, units: uByYear.get(r.period) ?? 0, ca: r.ca ?? 0 }));
}

/** Ventes par mois (1..12) pour une année. Complète les mois vides à 0. */
export async function salesByMonth(year: number, bookSlug?: string): Promise<YearRow[]> {
  let rows: any[];
  if (bookSlug) {
    rows = await query<any>(
      `SELECT time::month(in.created_at) AS period, count() AS orders, math::sum(qty) AS units, math::sum(line_total) AS ca
         FROM contains WHERE in.status IN ${PAID} AND out.slug = $s AND time::year(in.created_at) = $y GROUP BY period`,
      { s: bookSlug, y: year }
    );
  } else {
    const o = await query<any>(
      `SELECT time::month(created_at) AS period, count() AS orders, math::sum(total) AS ca
         FROM order WHERE status IN ${PAID} AND time::year(created_at) = $y GROUP BY period`,
      { y: year }
    );
    const u = await query<any>(
      `SELECT time::month(in.created_at) AS period, math::sum(qty) AS units FROM contains WHERE in.status IN ${PAID} AND time::year(in.created_at) = $y GROUP BY period`,
      { y: year }
    );
    const uByM = new Map<number, number>();
    for (const x of u) uByM.set(x.period, x.units ?? 0);
    rows = o.map((r) => ({ period: r.period, orders: r.orders, ca: r.ca, units: uByM.get(r.period) ?? 0 }));
  }
  const byMonth = new Map<number, any>();
  for (const r of rows) byMonth.set(r.period, r);
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const r = byMonth.get(m);
    return { period: m, orders: r?.orders ?? 0, units: r?.units ?? 0, ca: r?.ca ?? 0 };
  });
}

export interface TopBook { title: string; slug: string; units: number; ca: number }

export async function topBooks(opts: { year?: number; limit?: number } = {}): Promise<TopBook[]> {
  const cond = opts.year ? `AND time::year(in.created_at) = $y` : '';
  const rows = await query<any>(
    `SELECT out.title AS title, out.slug AS slug, math::sum(qty) AS units, math::sum(line_total) AS ca
       FROM contains WHERE in.status IN ${PAID} ${cond} GROUP BY title, slug ORDER BY units DESC LIMIT $limit`,
    { y: opts.year, limit: opts.limit ?? 12 }
  );
  return rows.filter((r) => r.slug).map((r) => ({ title: r.title ?? '—', slug: r.slug, units: r.units ?? 0, ca: r.ca ?? 0 }));
}

export interface FormatRow { format: string; units: number; ca: number }

export async function formatBreakdown(opts: { year?: number; bookSlug?: string } = {}): Promise<FormatRow[]> {
  const cond = [`in.status IN ${PAID}`];
  const vars: Record<string, unknown> = {};
  if (opts.year) { cond.push(`time::year(in.created_at) = $y`); vars.y = opts.year; }
  if (opts.bookSlug) { cond.push(`out.slug = $s`); vars.s = opts.bookSlug; }
  const rows = await query<any>(
    `SELECT format, math::sum(qty) AS units, math::sum(line_total) AS ca FROM contains WHERE ${cond.join(' AND ')} GROUP BY format ORDER BY units DESC`,
    vars
  );
  return rows.map((r) => ({ format: r.format ?? '?', units: r.units ?? 0, ca: r.ca ?? 0 }));
}

export interface Overview { orders: number; ca: number; units: number; aov: number }

export async function overview(bookSlug?: string): Promise<Overview> {
  if (bookSlug) {
    const r = (await query<any>(
      `SELECT count() AS orders, math::sum(qty) AS units, math::sum(line_total) AS ca FROM contains WHERE in.status IN ${PAID} AND out.slug = $s GROUP ALL`,
      { s: bookSlug }
    ))[0];
    const ca = r?.ca ?? 0, orders = r?.orders ?? 0;
    return { orders, ca, units: r?.units ?? 0, aov: orders ? ca / orders : 0 };
  }
  const o = (await query<any>(`SELECT count() AS orders, math::sum(total) AS ca FROM order WHERE status IN ${PAID} GROUP ALL`))[0];
  const u = (await query<any>(`SELECT math::sum(qty) AS units FROM contains WHERE in.status IN ${PAID} GROUP ALL`))[0];
  const ca = o?.ca ?? 0, orders = o?.orders ?? 0;
  return { orders, ca, units: u?.units ?? 0, aov: orders ? ca / orders : 0 };
}

export interface YtdSales {
  year: number; prevYear: number;
  ca: number; orders: number;
  prevCa: number; prevOrders: number;
  deltaPct: number | null;
}

/** Ventes de l'année en cours (au `now`) vs même période l'an dernier. */
export async function ytdSales(now: Date): Promise<YtdSales> {
  const year = now.getUTCFullYear();
  const prevYear = year - 1;
  const cur = (await query<any>(
    `SELECT count() AS orders, math::sum(total) AS ca FROM order
       WHERE status IN ${PAID} AND created_at >= type::datetime($from) AND created_at < type::datetime($to) GROUP ALL`,
    { from: fmtISO(new Date(Date.UTC(year, 0, 1))), to: fmtISO(now) }
  ))[0];
  // Même jour/mois l'an dernier (borne haute).
  const prevTo = new Date(Date.UTC(prevYear, now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()));
  const prev = (await query<any>(
    `SELECT count() AS orders, math::sum(total) AS ca FROM order
       WHERE status IN ${PAID} AND created_at >= type::datetime($from) AND created_at < type::datetime($to) GROUP ALL`,
    { from: fmtISO(new Date(Date.UTC(prevYear, 0, 1))), to: fmtISO(prevTo) }
  ))[0];
  const ca = cur?.ca ?? 0, prevCa = prev?.ca ?? 0;
  return {
    year, prevYear,
    ca, orders: cur?.orders ?? 0,
    prevCa, prevOrders: prev?.orders ?? 0,
    deltaPct: prevCa > 0 ? ((ca - prevCa) / prevCa) * 100 : null
  };
}

/** Livres ayant des ventes (pour le filtre), triés par titre. */
export async function booksWithSales(): Promise<{ slug: string; title: string }[]> {
  const rows = await query<any>(
    `SELECT out.slug AS slug, out.title AS title FROM contains WHERE in.status IN ${PAID} GROUP BY slug, title ORDER BY title`
  );
  return rows.filter((r) => r.slug).map((r) => ({ slug: r.slug, title: r.title ?? '—' }));
}
