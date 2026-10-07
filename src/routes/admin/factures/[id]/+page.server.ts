import { error, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { getInvoice, createManualInvoice } from '$lib/server/invoice';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ params, locals }) => {
  requireAdmin(locals);
  const invoice = await getInvoice(params.id);
  if (!invoice) throw error(404, { message: 'Facture introuvable' });
  return { invoice };
};

export const actions: Actions = {
  credit_note: async ({ params, locals }) => {
    requireAdmin(locals);
    const srcId = params.id;
    if (!srcId) throw error(404, { message: 'Facture introuvable' });
    const inv = await getInvoice(srcId);
    if (!inv) throw error(404, { message: 'Facture introuvable' });
    if (inv.kind !== 'invoice') throw redirect(303, withFlash(`/admin/factures/${srcId}`, 'Un avoir ne peut porter que sur une facture.', 'error'));
    const ht = inv.price_mode === 'ht';
    const id = await createManualInvoice({
      kind: 'credit_note',
      bill_to: inv.bill_to, clientId: inv.client_id ?? undefined, customerId: inv.customer_id ?? undefined,
      vat_rate: inv.vat_rate, price_mode: ht ? 'ht' : 'ttc',
      notes: `Avoir sur la facture n° ${inv.ref}`,
      lines: (inv.lines ?? []).map((l: any) => ({ description: l.description, qty: l.qty, unit_price: ht ? (l.unit_price_ht ?? l.unit_price_ttc) : l.unit_price_ttc, vat_rate: l.vat_rate, book: l.book, isbn: l.isbn }))
    });
    throw redirect(303, withFlash(`/admin/factures/${id}`, 'Avoir créé.', 'success'));
  }
};
