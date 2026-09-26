import { error, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { getBookLite, bookContributorsWithContracts, upsertContract, deleteContract, getReglagesDroits, setProvisionLivre, type Tier } from '$lib/server/droits';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ params }) => {
  const book = await getBookLite(params.bookId);
  if (!book) throw error(404, { message: 'Livre introuvable' });
  const [contributors, reglages] = await Promise.all([
    bookContributorsWithContracts(params.bookId),
    getReglagesDroits()
  ]);
  return { book, contributors, reglages };
};

export const actions: Actions = {
  /** Provision sur retours propre à ce livre (vide = défaut global). */
  provision: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const v = String(fd.get('returns_provision_rate') ?? '').trim();
    await setProvisionLivre(params.bookId!, v === '' ? null : Number(v.replace(',', '.')));
    throw redirect(303, withFlash(`/admin/droits/contrats/${params.bookId}`, 'Provision enregistrée.', 'success'));
  },

  save: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const bookId = params.bookId;
    if (!bookId) throw error(400, { message: 'Livre manquant' });
    const fd = await request.formData();
    const S = (k: string) => (fd.get(k) ? String(fd.get(k)).trim() : '');
    const N = (k: string) => { const v = S(k); return v === '' ? undefined : Number(v.replace(',', '.')); };
    let tiers: Tier[] = [];
    try { tiers = JSON.parse(S('tiers') || '[]'); } catch { /* noop */ }

    await upsertContract({
      bookId,
      authorId: S('authorId'),
      role: S('role') || 'author',
      tiers,
      scope: S('scope') || 'all',
      base: S('base') || 'ppht',
      net_rate: N('net_rate') ?? 60,
      advance: N('advance') ?? 0,
      advance_recouped: N('advance_recouped') ?? 0,
      status: S('status') || 'active',
      notes: S('notes') || undefined
    });
    throw redirect(303, withFlash(`/admin/droits/contrats/${bookId}`, 'Contrat enregistré.', 'success'));
  },

  delete: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const id = String(fd.get('contractId') || '');
    if (id) await deleteContract(id);
    throw redirect(303, withFlash(`/admin/droits/contrats/${params.bookId}`, 'Contrat supprimé.', 'success'));
  }
};
