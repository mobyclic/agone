import type { PageServerLoad } from './$types';
import { query } from '$lib/server/surreal';
import { listOrdersAdmin } from '$lib/server/order';
import { ytdSales } from '$lib/server/stats';
import { seuilAlerteStock } from '$lib/server/catalogue';
import { isAdmin } from '$lib/roles';

async function count(table: string, where = ''): Promise<number> {
  const rows = await query<any>(`SELECT count() AS n FROM ${table} ${where ? `WHERE ${where}` : ''} GROUP ALL`);
  return rows[0]?.n ?? 0;
}

export const load: PageServerLoad = async ({ locals }) => {
  const now = new Date();
  // Ventes et commandes relèvent de la Boutique : réservées aux administrateurs,
  // donc ni calculées ni transmises aux autres membres du staff.
  const admin = isAdmin(locals.user?.role);
  const [ytd, pending, books, forthcoming, drafts, outOfPrint, stockBas, authors, articles, articleDrafts, events, pastEvents, recent] = await Promise.all([
    admin ? ytdSales(now) : Promise.resolve(null),
    admin ? count('order', "status = 'pending'") : Promise.resolve(0),
    count('book', "status = 'published' AND (published_at = NONE OR published_at <= time::now())"),
    count('book', "status = 'published' AND published_at != NONE AND published_at > time::now()"),
    count('book', "status = 'draft'"),
    // Épuisé = état dérivé : en ligne, déjà paru, plus de stock.
    count('book', "status = 'published' AND (published_at = NONE OR published_at <= time::now()) AND stock_qty <= 0"),
    // Alerte : stock faible mais pas nul — le réassort se décide là.
    seuilAlerteStock().then((s) =>
      count('book', `status = 'published' AND (published_at = NONE OR published_at <= time::now()) AND stock_qty > 0 AND stock_qty <= ${s}`)
    ),
    count('author'),
    count('article', "status = 'published'"),
    count('article', "status = 'draft'"),
    count('event', 'start_at != NONE AND start_at > time::now()'),
    count('event', 'start_at != NONE AND start_at <= time::now()'),
    admin ? listOrdersAdmin({ limit: 6 }) : Promise.resolve({ orders: [] })
  ]);
  return {
    isAdmin: admin,
    ytd,
    pending,
    asOf: now.toISOString(),
    counts: { books, forthcoming, drafts, outOfPrint, stockBas, authors, articles, articleDrafts, events, pastEvents },
    recentOrders: recent.orders
  };
};
