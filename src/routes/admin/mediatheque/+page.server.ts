import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { listMedias, comptesParUsage, USAGES, type UsageMedia } from '$lib/server/mediatheque';
import { deleteMedia } from '$lib/server/media';
import { journaliser } from '$lib/server/journal';
import { withFlash } from '$lib/toasts';

const LIMIT = 48;

export const load: PageServerLoad = async ({ url, locals }) => {
  requireAdmin(locals);
  const usage = (url.searchParams.get('usage') ?? '') as UsageMedia | '';
  const q = url.searchParams.get('q') ?? '';
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const [{ medias, total }, comptes] = await Promise.all([
    listMedias({ usage: usage && USAGES[usage] ? usage : undefined, q, limit: LIMIT, offset: (page - 1) * LIMIT }),
    comptesParUsage()
  ]);
  return { medias, total, comptes, usages: USAGES, usage, q, page, limit: LIMIT };
};

export const actions: Actions = {
  supprimer: async ({ request, locals, url }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    try {
      const ok = await deleteMedia(id);
      if (!ok) return fail(404, { error: 'Fichier introuvable.' });
      await journaliser(locals, { action: 'media.supprime', cible: { type: 'media', id, libelle: String(fd.get('nom') ?? '') } });
      throw redirect(303, withFlash(`/admin/mediatheque${url.search}`, 'Fichier supprimé.', 'success'));
    } catch (e) {
      if ((e as any)?.status === 303) throw e;
      return fail(400, { error: e instanceof Error ? e.message : 'Suppression impossible.' });
    }
  }
};
