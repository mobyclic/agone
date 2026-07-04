import { redirect, fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { listStatements, listPeriods, generateStatements } from '$lib/server/droits';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ url }) => {
  const start = url.searchParams.get('start') ?? undefined;
  const end = url.searchParams.get('end') ?? undefined;
  const periods = await listPeriods();
  const statements = start && end ? await listStatements(new Date(start), new Date(end)) : [];
  return { periods, statements, start, end };
};

export const actions: Actions = {
  generate: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const start = String(fd.get('period_start') || '');
    const end = String(fd.get('period_end') || '');
    if (!start || !end) return fail(400, { error: 'Période requise.' });
    const n = await generateStatements(new Date(start), new Date(end));
    throw redirect(303, withFlash(`/admin/droits/reddition?start=${start}&end=${end}`, `${n} reddition(s) générée(s).`, 'success'));
  }
};
