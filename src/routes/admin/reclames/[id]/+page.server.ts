import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { getReclame, saveReclame, KIND_RECLAME, VARIANTS_BANDEAU, FREQUENCES, type KindReclame } from '$lib/server/reclames';
import { journaliser } from '$lib/server/journal';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ params, url, locals }) => {
  requireAdmin(locals);
  const commun = { kinds: KIND_RECLAME, variants: VARIANTS_BANDEAU, frequences: FREQUENCES };
  if (params.id === 'nouveau') return { reclame: null, kind: (url.searchParams.get('kind') === 'modal' ? 'modal' : 'bandeau') as KindReclame, ...commun };
  const reclame = await getReclame(params.id);
  if (!reclame) throw error(404, { message: 'Réclame introuvable' });
  return { reclame, kind: reclame.kind, ...commun };
};

export const actions: Actions = {
  save: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const S = (k: string) => String(fd.get(k) ?? '').trim();
    const editId = params.id === 'nouveau' ? null : String(params.id);
    try {
      const id = await saveReclame(editId, {
        kind: S('kind') === 'modal' ? 'modal' : 'bandeau', status: S('status') === 'published' ? 'published' : 'draft', title: S('title'),
        message: S('message'), url: S('url'), cta_label: S('cta_label'), imageId: S('imageId') || undefined,
        variant: S('variant'), frequency: S('frequency'), delay: Number(S('delay')), starts_at: S('starts_at'), ends_at: S('ends_at')
      });
      await journaliser(locals, { action: editId ? 'reclame.modifiee' : 'reclame.creee', cible: { type: 'reclame', id, libelle: S('title') } });
      throw redirect(303, withFlash('/admin/reclames', editId ? 'Réclame enregistrée.' : 'Réclame créée.', 'success'));
    } catch (e) {
      if ((e as any)?.status === 303) throw e;
      return fail(400, { error: e instanceof Error ? e.message : 'Enregistrement impossible.' });
    }
  }
};
