import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { releverEncaissements, sumupConfigure } from '$lib/server/sumup';

// Cron : relève les encaissements SumUp des dix derniers jours (chevauchement
// voulu : un encaissement déjà connu est simplement remis à jour) et rapproche
// les nouveaux. Gardé par CRON_SECRET.
export const POST: RequestHandler = async ({ request, url }) => {
  const secret = request.headers.get('x-cron-secret') || url.searchParams.get('secret');
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) throw error(401, { message: 'unauthorized' });
  if (!sumupConfigure()) return json({ ok: false, error: 'SUMUP_API_KEY absente' }, { status: 500 });
  try {
    const fin = new Date();
    const debut = new Date(fin.getTime() - 10 * 24 * 3600 * 1000);
    const r = await releverEncaissements(debut, fin);
    return json({ ok: true, ...r });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
};
