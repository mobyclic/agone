import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBookBySlug } from '$lib/server/catalogue';
import { extraitPropre } from '$lib/text';

/** Texte brut d'un HTML éditorial (balises retirées, entités courantes décodées). */
const texte = (html?: string) =>
  (html ?? '')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#8217;|&rsquo;/g, '’').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&#8230;|&hellip;/g, '…');

/**
 * Aperçu d'un livre pour la fenêtre du catalogue : le début de la présentation.
 * Chargé à la demande (et gardé en cache côté client) pour ne pas alourdir la page
 * catalogue de ~400 résumés.
 */
export const GET: RequestHandler = async ({ params, setHeaders }) => {
  const b = await getBookBySlug(params.slug);
  if (!b) throw error(404, 'Livre introuvable');
  setHeaders({ 'cache-control': 'public, max-age=300' });
  return json({ resume: extraitPropre(texte(b.description_html), 650) ?? null });
};
