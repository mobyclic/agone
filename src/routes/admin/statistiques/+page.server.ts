import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { booksWithSales } from '$lib/server/stats';
import { ventesParCanal, anneesDisponibles } from '$lib/server/statsCanaux';

/**
 * Statistiques par canal : tout vient de la source unifiée (commandes du site,
 * mouvements Belles Lettres, relevés importés). Le choix des canaux vit dans
 * l'URL (`canaux=web:paper,bldd`) : la vue reste partageable.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
  requireAdmin(locals);
  const bookSlug = url.searchParams.get('livre') || undefined;
  const [tout, books] = await Promise.all([ventesParCanal({ bookSlug }), booksWithSales()]);
  const years = anneesDisponibles(tout);
  const year = Number(url.searchParams.get('annee')) || years[0] || new Date().getUTCFullYear();
  const annee = await ventesParCanal({ annee: year, bookSlug });
  const param = url.searchParams.get('canaux');
  const selection = param ? param.split(',').filter((k) => tout.series.some((s) => s.key === k)) : tout.series.map((s) => s.key);
  const bookTitle = bookSlug ? books.find((b) => b.slug === bookSlug)?.title : undefined;
  return {
    series: tout.series, tout: tout.points, annee, year, years, selection, books, bookSlug, bookTitle,
    jour: new Date().toISOString()
  };
};
