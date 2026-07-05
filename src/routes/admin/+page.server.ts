import type { PageServerLoad } from './$types';
import { query } from '$lib/server/surreal';
import { orderStats, listOrdersAdmin } from '$lib/server/order';

async function count(table: string, where = ''): Promise<number> {
  const rows = await query<any>(`SELECT count() AS n FROM ${table} ${where ? `WHERE ${where}` : ''} GROUP ALL`);
  return rows[0]?.n ?? 0;
}

export const load: PageServerLoad = async () => {
  const [stats, books, forthcoming, authors, articles, events, recent] = await Promise.all([
    orderStats(),
    count('book', "status = 'published'"),
    count('book', "status = 'forthcoming'"),
    count('author'),
    count('article', "status = 'published'"),
    count('event', 'start_at > time::now()'),
    listOrdersAdmin({ limit: 6 })
  ]);
  return {
    stats,
    counts: { books, forthcoming, authors, articles, events },
    recentOrders: recent.orders
  };
};
