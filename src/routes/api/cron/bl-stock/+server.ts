import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { syncBldStock } from '$lib/server/belleslettres';

// Cron import stock BLDD (lecture seule côté BLDD), guardé par CRON_SECRET.
export const POST: RequestHandler = async ({ request, url }) => {
  const secret = request.headers.get('x-cron-secret') || url.searchParams.get('secret');
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) throw error(401, { message: 'unauthorized' });
  try {
    const res = await syncBldStock();
    return json({ ok: true, matched: res.matched, updated: res.updated });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
};
