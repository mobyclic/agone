import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { envoyerRappelsRenouvellement } from '$lib/server/club';

// Cron quotidien : prévient les membres du club 15 jours avant le renouvellement
// automatique de leur adhésion (un seul e-mail par période). Gardé par CRON_SECRET.
export const POST: RequestHandler = async ({ request, url }) => {
  const secret = request.headers.get('x-cron-secret') || url.searchParams.get('secret');
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) throw error(401, { message: 'unauthorized' });
  try {
    return json({ ok: true, ...(await envoyerRappelsRenouvellement()) });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
};
