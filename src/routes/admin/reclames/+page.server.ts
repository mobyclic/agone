import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { listReclames, setStatutReclame, deleteReclame, KIND_RECLAME } from '$lib/server/reclames';
import { journaliser } from '$lib/server/journal';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals);
  return { reclames: await listReclames(), kinds: KIND_RECLAME };
};

export const actions: Actions = {
  statut: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const id = String(fd.get('id') ?? ''), status = String(fd.get('status')) === 'published' ? 'published' : 'draft';
    if (!id) return fail(400, { error: 'Réclame introuvable.' });
    await setStatutReclame(id, status);
    await journaliser(locals, { action: status === 'published' ? 'reclame.publiee' : 'reclame.brouillon', cible: { type: 'reclame', id } });
    throw redirect(303, withFlash('/admin/reclames', status === 'published' ? 'Réclame en ligne.' : 'Réclame mise en brouillon.', 'success'));
  },
  supprimer: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    if (!id) return fail(400, { error: 'Réclame introuvable.' });
    await deleteReclame(id);
    await journaliser(locals, { action: 'reclame.supprimee', cible: { type: 'reclame', id } });
    throw redirect(303, withFlash('/admin/reclames', 'Réclame supprimée.', 'success'));
  }
};
