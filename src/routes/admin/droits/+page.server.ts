import { redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { ensureChannels, listChannels, getReglagesDroits, setReglagesDroits, recapDroits, directeursPossibles } from '$lib/server/droits';
import { withFlash } from '$lib/toasts';
import { journaliser } from '$lib/server/journal';

export const load: PageServerLoad = async ({ url }) => {
  await ensureChannels();
  const annee = Number(url.searchParams.get('annee')) || undefined;
  const [channels, recap, reglages, directeurs] = await Promise.all([
    listChannels(), recapDroits(annee), getReglagesDroits(), directeursPossibles()
  ]);
  return { channels, recap, reglages, directeurs };
};

export const actions: Actions = {
  reglages: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    await setReglagesDroits({
      provision_rate: Number(String(fd.get('provision_rate') ?? '').replace(',', '.')),
      threshold: Number(String(fd.get('threshold') ?? '').replace(',', '.')),
      directeur_defaut: String(fd.get('directeur_defaut') ?? '') || undefined
    });
    await journaliser(locals, { action: 'reglages.droits', cible: { type: 'site_setting', id: 'droits', libelle: 'Règles de calcul des droits' }, details: { provision: String(fd.get('provision_rate') ?? ''), seuil: String(fd.get('threshold') ?? ''), directeur: String(fd.get('directeur_defaut') ?? '') } });
    throw redirect(303, withFlash('/admin/droits', 'Règles de calcul enregistrées.', 'success'));
  }
};
