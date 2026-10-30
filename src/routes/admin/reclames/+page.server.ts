import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { listReclames, setStatutReclame, deleteReclame, concurrentes, KIND_RECLAME } from '$lib/server/reclames';
import { journaliser } from '$lib/server/journal';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals);
  const reclames = await listReclames();
  // Ce que la mise en ligne de chaque réclame désactiverait (confirmation côté page).
  const avecConflits = reclames.map((r) => ({
    ...r,
    conflits: concurrentes(r, reclames).map((x) => ({ id: x.id, title: x.title, en_ligne: x.en_ligne, starts_at: x.starts_at, ends_at: x.ends_at }))
  }));
  return { reclames: avecConflits, kinds: KIND_RECLAME };
};

export const actions: Actions = {
  statut: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const id = String(fd.get('id') ?? ''), status = String(fd.get('status')) === 'published' ? 'published' : 'draft';
    if (!id) return fail(400, { error: 'Réclame introuvable.' });
    let retirees;
    try { retirees = await setStatutReclame(id, status); }
    catch (e) { return fail(400, { error: e instanceof Error ? e.message : 'Changement impossible.' }); }
    await journaliser(locals, { action: status === 'published' ? 'reclame.publiee' : 'reclame.brouillon', cible: { type: 'reclame', id } });
    for (const x of retirees) await journaliser(locals, { action: 'reclame.brouillon', cible: { type: 'reclame', id: x.id, libelle: x.title } });
    const msg = status === 'draft' ? 'Réclame mise en brouillon.'
      : retirees.length ? `Réclame en ligne ; ${retirees.map((x) => `« ${x.title} »`).join(', ')} ${retirees.length > 1 ? 'passées' : 'passée'} en brouillon.` : 'Réclame en ligne.';
    throw redirect(303, withFlash('/admin/reclames', msg, 'success'));
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
