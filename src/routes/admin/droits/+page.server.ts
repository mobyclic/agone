import { redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { ensureChannels, listChannels, getReglagesDroits, setReglagesDroits, recapDroits } from '$lib/server/droits';
import { withFlash } from '$lib/toasts';
import { query } from '$lib/server/surreal';

const countOf = (t: string) =>
  query<any>(`SELECT count() AS n FROM ${t} GROUP ALL`).then((r) => r[0]?.n ?? 0);

export const load: PageServerLoad = async ({ url }) => {
  await ensureChannels();
  const annee = Number(url.searchParams.get('annee')) || undefined;
  const [channels, recap, contracts, reports, statements, cessions, reglages] = await Promise.all([
    listChannels(),
    recapDroits(annee),
    countOf('royalty_contract'),
    countOf('sales_report'),
    countOf('royalty_statement'),
    countOf('rights_deal'),
    getReglagesDroits()
  ]);
  return { channels, recap, reglages, stats: { contracts, reports, statements, cessions } };
};

export const actions: Actions = {
  reglages: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    await setReglagesDroits({
      provision_rate: Number(String(fd.get('provision_rate') ?? '').replace(',', '.')),
      threshold: Number(String(fd.get('threshold') ?? '').replace(',', '.'))
    });
    throw redirect(303, withFlash('/admin/droits', 'Règles de calcul enregistrées.', 'success'));
  }
};
