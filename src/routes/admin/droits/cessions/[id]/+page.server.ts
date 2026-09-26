import { error, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { getDeal, upsertDeal, deleteDeal, listPayments, addPayment, setPaymentSettled, deletePayment } from '$lib/server/cessions';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ params }) => {
  const deal = await getDeal(params.id);
  if (!deal) throw error(404, { message: 'Cession introuvable' });
  return { deal, payments: await listPayments(params.id) };
};

export const actions: Actions = {
  save: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const S = (k: string) => String(fd.get(k) ?? '').trim();
    const N = (k: string) => { const v = S(k); return v === '' ? undefined : Number(v.replace(',', '.')); };
    await upsertDeal({
      id: params.id,
      bookId: S('bookId'),
      direction: S('direction') === 'in' ? 'in' : 'out',
      counterparty: S('counterparty'),
      country: S('country') || undefined,
      language: S('language') || undefined,
      territory: S('territory') || undefined,
      kind: S('kind'),
      signed_at: S('signed_at') || undefined,
      term_years: N('term_years'),
      expires_at: S('expires_at') || undefined,
      publish_deadline: S('publish_deadline') || undefined,
      advance: N('advance') ?? 0,
      currency: S('currency') || 'EUR',
      rate_paper: N('rate_paper'),
      rate_paper_base: S('rate_paper_base'),
      rate_ebook: N('rate_ebook'),
      rate_ebook_base: S('rate_ebook_base'),
      author_share: N('author_share') ?? 50,
      status: S('status'),
      notes: S('notes') || undefined
    });
    throw redirect(303, withFlash(`/admin/droits/cessions/${params.id}`, 'Cession enregistrée.', 'success'));
  },

  /** Nouvelle échéance : à-valoir, redevance annuelle, divers. */
  payment: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const S = (k: string) => String(fd.get(k) ?? '').trim();
    await addPayment(params.id!, {
      kind: S('kind') || 'royalty',
      amount: Number(S('amount').replace(',', '.')) || 0,
      currency: S('currency') || 'EUR',
      due_on: S('due_on') || undefined,
      settled_at: S('settled_at') || undefined,
      period_start: S('period_start') || undefined,
      period_end: S('period_end') || undefined,
      notes: S('notes') || undefined
    });
    throw redirect(303, withFlash(`/admin/droits/cessions/${params.id}`, 'Échéance ajoutée.', 'success'));
  },

  /** Pointage : une somme ne compte dans la reddition qu'une fois réglée. */
  settle: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    await setPaymentSettled(String(fd.get('paymentId') ?? ''), fd.get('settled') === 'true', String(fd.get('date') ?? '') || undefined);
    throw redirect(303, withFlash(`/admin/droits/cessions/${params.id}`, 'Échéance mise à jour.', 'success'));
  },

  deletePayment: async ({ request, params, locals }) => {
    requireAdmin(locals);
    await deletePayment(String((await request.formData()).get('paymentId') ?? ''));
    throw redirect(303, withFlash(`/admin/droits/cessions/${params.id}`, 'Échéance supprimée.', 'success'));
  },

  delete: async ({ params, locals }) => {
    requireAdmin(locals);
    await deleteDeal(params.id!);
    throw redirect(303, withFlash('/admin/droits/cessions', 'Cession supprimée.', 'success'));
  }
};
