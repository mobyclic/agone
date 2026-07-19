import type { PageServerLoad } from './$types';
import { query } from '$lib/server/surreal';
import { listOrdersAdmin } from '$lib/server/order';
import { ytdSales } from '$lib/server/stats';

async function count(table: string, where = ''): Promise<number> {
  const rows = await query<any>(`SELECT count() AS n FROM ${table} ${where ? `WHERE ${where}` : ''} GROUP ALL`);
  return rows[0]?.n ?? 0;
}

export const load: PageServerLoad = async () => {
  const now = new Date();
  const [ytd, pending, books, forthcoming, drafts, outOfPrint, authors, articles, articleDrafts, events, pastEvents, recent] = await Promise.all([
    ytdSales(now),
    count('order', "status = 'pending'"),
    count('book', "status = 'published' AND (published_at = NONE OR published_at <= time::now())"),
    count('book', "status = 'published' AND published_at != NONE AND published_at > time::now()"),
    count('book', "status = 'draft'"),
    count('book', "status = 'out_of_print'"),
    count('author'),
    count('article', "status = 'published'"),
    count('article', "status = 'draft'"),
    count('event', 'start_at != NONE AND start_at > time::now()'),
    count('event', 'start_at != NONE AND start_at <= time::now()'),
    listOrdersAdmin({ limit: 6 })
  ]);
  return {
    ytd,
    pending,
    asOf: now.toISOString(),
    counts: { books, forthcoming, drafts, outOfPrint, authors, articles, articleDrafts, events, pastEvents },
    recentOrders: recent.orders
  };
};
