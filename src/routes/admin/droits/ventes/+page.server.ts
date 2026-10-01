import { fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { lancerCollecte, etatCollecte } from '$lib/server/droits-job';
import { resumeCanaux } from '$lib/server/ventesLignes';
import { journaliser } from '$lib/server/journal';

export const load: PageServerLoad = async ({ url }) => {
  const annee = Number(url.searchParams.get('annee')) || new Date().getUTCFullYear();
  return { resume: await resumeCanaux(annee), annee, collecte: etatCollecte() };
};

export const actions: Actions = {
  /**
   * Relevé complet d'une période : toutes les sources, en tâche de fond.
   * L'action rend la main aussitôt ; la page suit l'avancement.
   */
  collecte: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const annee = Number(fd.get('annee'));
    const start = String(fd.get('period_start') || '');
    const end = String(fd.get('period_end') || '');
    const debut = Number.isFinite(annee) && annee > 2000 ? new Date(Date.UTC(annee, 0, 1)) : start ? new Date(start) : null;
    const fin = Number.isFinite(annee) && annee > 2000 ? new Date(Date.UTC(annee, 11, 31)) : end ? new Date(end) : null;
    if (!debut || !fin || Number.isNaN(+debut) || Number.isNaN(+fin)) return fail(400, { error: 'Période requise.' });
    if (fin < debut) return fail(400, { error: 'La fin de période précède son début.' });
    lancerCollecte({ start: debut, end: fin, avecExport: fd.get('avecExport') === 'on' });
    await journaliser(locals, { action: 'ventes.releve_lance', cible: { type: 'sales_report', id: debut.toISOString().slice(0, 10), libelle: `Relevé ${debut.toLocaleDateString('fr-FR')} → ${fin.toLocaleDateString('fr-FR')}` }, details: { debut: debut.toISOString().slice(0, 10), fin: fin.toISOString().slice(0, 10), export: fd.get('avecExport') === 'on' } });
    return { lance: true };
  }
};
