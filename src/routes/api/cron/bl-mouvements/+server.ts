import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { importMouvementsBldd } from '$lib/server/droits';

/**
 * Cron mensuel : mouvements de stock du distributeur pour le MOIS ÉCOULÉ
 * (stock d'ouverture et de clôture, fabrication, sorties, SP). Lecture seule
 * côté BLDD ; une requête. Gardé par CRON_SECRET, comme les autres.
 * À lancer le 3 ou le 4 du mois, le temps que Les Belles Lettres arrêtent le mois.
 */
export const POST: RequestHandler = async ({ request, url }) => {
  const secret = request.headers.get('x-cron-secret') || url.searchParams.get('secret');
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) throw error(401, { message: 'unauthorized' });
  const maintenant = new Date();
  const debut = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() - 1, 1));
  const fin = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 0));
  try {
    const res = await importMouvementsBldd(debut, fin);
    return json({ ok: true, periode: [debut.toISOString().slice(0, 10), fin.toISOString().slice(0, 10)], ...res });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
};
