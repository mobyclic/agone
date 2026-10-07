import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { getInvoice, createManualInvoice, listPayments, addPayment, deletePayment, PAYMENT_METHODS } from '$lib/server/invoice';
import { heureParisVersDate } from '$lib/dates';
import { envoyerFacture } from '$lib/server/factureMail';
import { convertirProforma } from '$lib/server/invoice';
import { withFlash } from '$lib/toasts';
import { journaliser } from '$lib/server/journal';

export const load: PageServerLoad = async ({ params, locals }) => {
  requireAdmin(locals);
  const invoice = await getInvoice(params.id);
  if (!invoice) throw error(404, { message: 'Facture introuvable' });
  return { invoice, payments: await listPayments(params.id), methods: PAYMENT_METHODS };
};

export const actions: Actions = {
  /** Envoi au client, PDF joint ; une proforma part avec son lien de validation. */
  envoyer: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const to = String(fd.get('to') ?? '').trim();
    const r = await envoyerFacture(params.id!, { to, message: String(fd.get('message') ?? '').trim() || undefined });
    if (!r.ok) return fail(400, { error: r.error ?? 'Envoi impossible.' });
    await journaliser(locals, { action: 'facture.envoyee', cible: { type: 'invoice', id: params.id!, libelle: 'Facture envoyée' }, details: { a: to } });
    throw redirect(303, withFlash(`/admin/factures/${params.id}`, `Envoyée à ${to}.`, 'success'));
  },
  /** Proforma → facture définitive, sans attendre la validation du client. */
  convertir: async ({ params, locals }) => {
    requireAdmin(locals);
    try {
      const nid = await convertirProforma(params.id!);
      await journaliser(locals, { action: 'proforma.convertie', cible: { type: 'invoice', id: nid, libelle: 'Facture issue d’une proforma' }, details: { proforma: params.id } });
      throw redirect(303, withFlash(`/admin/factures/${nid}`, 'Facture créée à partir de la proforma.', 'success'));
    } catch (e) {
      if ((e as any)?.status === 303) throw e;
      return fail(400, { error: e instanceof Error ? e.message : 'Conversion impossible.' });
    }
  },
  /** Un règlement : montant, date, mode, référence. L'état de la facture suit. */
  payment_add: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const S = (k: string) => String(fd.get(k) ?? '').trim();
    const amount = Number(S('amount').replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) return fail(400, { error: 'Indiquez un montant.' });
    const jour = S('paid_at');
    try {
      await addPayment(params.id!, { amount, paid_at: jour ? heureParisVersDate(`${jour}T12:00`) ?? undefined : undefined, method: S('method'), reference: S('reference'), note: S('note') });
      await journaliser(locals, { action: 'facture.reglement', cible: { type: 'invoice', id: params.id!, libelle: 'Règlement' }, details: { montant: amount, mode: S('method'), reference: S('reference') } });
    } catch (e) {
      return fail(400, { error: e instanceof Error ? e.message : 'Enregistrement impossible.' });
    }
    throw redirect(303, withFlash(`/admin/factures/${params.id}`, 'Règlement enregistré.', 'success'));
  },
  payment_delete: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const id = String((await request.formData()).get('paymentId') ?? '');
    if (id) await deletePayment(id);
    throw redirect(303, withFlash(`/admin/factures/${params.id}`, 'Règlement retiré.', 'success'));
  },
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
