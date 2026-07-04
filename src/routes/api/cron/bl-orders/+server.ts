import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { exportBlOrders } from '$lib/server/belleslettres';

// Cron 2×/jour (guardé par CRON_SECRET). En dry-run tant que BL_FTP_ENABLED != 'true'.
export const POST: RequestHandler = async ({ request, url }) => {
  const secret = request.headers.get('x-cron-secret') || url.searchParams.get('secret');
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) throw error(401, { message: 'unauthorized' });
  const res = await exportBlOrders();
  if (!res) return json({ ok: true, message: 'aucune commande à exporter' });
  return json({ ok: true, filename: res.filename, orders: res.order_count, books: res.book_count, dry_run: res.dry_run, uploaded: res.uploaded });
};
