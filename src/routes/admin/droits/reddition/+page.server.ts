import { redirect, fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { listStatements, listPeriods, generateStatements, couvertureExercices } from '$lib/server/droits';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ url }) => {
  const start = url.searchParams.get('start') ?? undefined;
  const end = url.searchParams.get('end') ?? undefined;
  const annees = [0, 1, 2, 3, 4].map((n) => new Date().getUTCFullYear() - n);
  const [periods, statements, couverture] = await Promise.all([
    listPeriods(),
    start && end ? listStatements(new Date(start), new Date(end)) : Promise.resolve([]),
    couvertureExercices(annees)
  ]);
  return { periods, statements, start, end, annees, couverture };
};

export const actions: Actions = {
  generate: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    // Exercice choisi dans la liste, ou période libre pour les cas particuliers.
    const annee = Number(fd.get('annee'));
    const exercice = Number.isFinite(annee) && annee > 2000;
    const start = exercice ? `${annee}-01-01` : String(fd.get('period_start') || '');
    const end = exercice ? `${annee}-12-31` : String(fd.get('period_end') || '');
    if (!start || !end) return fail(400, { error: 'Période requise.' });
    const n = await generateStatements(new Date(start), new Date(end));
    throw redirect(303, withFlash(`/admin/droits/reddition?start=${start}&end=${end}`, `${n} reddition(s) générée(s).`, 'success'));
  }
};
