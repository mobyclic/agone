import { redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { listDeals, upsertDeal, deleteDeal } from '$lib/server/cessions';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ url }) => {
  const direction = url.searchParams.get('sens') ?? '';
  const deals = await listDeals(direction ? { direction } : {});
  return { deals, direction };
};

export const actions: Actions = {
  /** Nouvelle cession : le détail se règle ensuite sur sa fiche. */
  create: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const S = (k: string) => String(fd.get(k) ?? '').trim();
    const id = await upsertDeal({
      bookId: S('bookId'),
      direction: S('direction') === 'in' ? 'in' : 'out',
      counterparty: S('counterparty') || 'À renseigner',
      language: S('language') || undefined,
      signed_at: S('signed_at') || undefined,
      advance: Number(S('advance').replace(',', '.')) || 0
    });
    throw redirect(303, withFlash(`/admin/droits/cessions/${id}`, 'Cession créée.', 'success'));
  },

  delete: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const id = String(fd.get('dealId') ?? '');
    if (id) await deleteDeal(id);
    throw redirect(303, withFlash('/admin/droits/cessions', 'Cession supprimée.', 'success'));
  }
};
