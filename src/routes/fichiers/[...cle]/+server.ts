import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getObject, estPrive } from '$lib/server/storage';

/**
 * Fichiers publics (couvertures, portraits, images d'articles…) servis depuis le bucket
 * privé Infomaniak. Les préfixes privés (ebooks, contrats, factures, carnets) ne passent
 * jamais par ici : ils ont leurs propres routes, qui vérifient les droits.
 */
export const GET: RequestHandler = async ({ params, request }) => {
  const cle = params.cle;
  if (!cle || cle.includes('..') || estPrive(cle)) throw error(404, 'Fichier introuvable');
  const obj = await getObject(cle);
  if (!obj) throw error(404, 'Fichier introuvable');
  const entetes: Record<string, string> = {
    'content-type': obj.contentType || 'application/octet-stream',
    // Une couverture remplacée garde sa clé : pas de cache « immutable », mais une journée.
    'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
    'x-content-type-options': 'nosniff'
  };
  if (obj.etag) entetes.etag = obj.etag;
  if (obj.lastModified) entetes['last-modified'] = obj.lastModified.toUTCString();
  if (obj.etag && request.headers.get('if-none-match') === obj.etag) return new Response(null, { status: 304, headers: entetes });
  return new Response(obj.body as any, { headers: entetes });
};
