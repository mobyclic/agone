import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import {
  getInvoice, createManualInvoice, emettreFacture, retourBrouillon, annulerFacture,
  listPayments, addPayment, deletePayment, PAYMENT_METHODS
} from '$lib/server/invoice';
import { envoyerFacture } from '$lib/server/factureMail';
import { query } from '$lib/server/surreal';
import { heureParisVersDate } from '$lib/dates';
import { withFlash } from '$lib/toasts';
import { journaliser } from '$lib/server/journal';

/** La fiche d'un document émis ; un brouillon renvoie à son édition. */
export const load: PageServerLoad = async ({ params, locals }) => {
  requireAdmin(locals);
  const invoice = await getInvoice(params.id);
  if (!invoice) throw error(404, { message: 'Facture introuvable' });
  if (invoice.status === 'draft') throw redirect(303, `/admin/factures/${params.id}/modifier`);
  const [payments, historique] = await Promise.all([
    listPayments(params.id),
    // Tout ce que le journal sait de ce document : création, émission, envois, règlements…
    query<any>(`SELECT action, actor_name, details, created_at FROM admin_log WHERE target_type = 'invoice' AND target_id = $id ORDER BY created_at DESC LIMIT 50`, { id: params.id })
  ]);
  return { invoice, payments, historique, methods: PAYMENT_METHODS };
};

const retour = (id: string, message: string, type: 'success' | 'error' | 'info' = 'success') => redirect(303, withFlash(`/admin/factures/${id}`, message, type));

export const actions: Actions = {
  /** Envoi au client, PDF joint ; une pro forma part avec son lien de validation. */
  envoyer: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const to = String(fd.get('to') ?? '').trim();
    const r = await envoyerFacture(params.id!, { to, message: String(fd.get('message') ?? '').trim() || undefined });
    if (!r.ok) return fail(400, { error: r.error ?? 'Envoi impossible.' });
    await journaliser(locals, { action: 'facture.envoyee', cible: { type: 'invoice', id: params.id!, libelle: 'Envoi au client' }, details: { a: to } });
    throw retour(params.id!, `Envoyée à ${to}.`);
  },
  /** Pro forma → facture émise, sans attendre la validation du client. */
  emettre: async ({ params, locals }) => {
    requireAdmin(locals);
    try {
      const { ref } = await emettreFacture(params.id!);
      await journaliser(locals, { action: 'facture.emise', cible: { type: 'invoice', id: params.id!, libelle: `Facture ${ref}` }, details: { depuis: 'pro forma' } });
      throw retour(params.id!, `Facture ${ref} émise.`);
    } catch (e) {
      if ((e as any)?.status === 303) throw e;
      return fail(400, { error: e instanceof Error ? e.message : 'Émission impossible.' });
    }
  },
  retour_brouillon: async ({ params, locals }) => {
    requireAdmin(locals);
    try {
      await retourBrouillon(params.id!);
      await journaliser(locals, { action: 'facture.brouillon', cible: { type: 'invoice', id: params.id!, libelle: 'Retour en brouillon' } });
    } catch (e) { return fail(400, { error: e instanceof Error ? e.message : 'Impossible.' }); }
    throw redirect(303, withFlash(`/admin/factures/${params.id}/modifier`, 'Revenue en brouillon : modifiez puis émettez ou repassez en pro forma.', 'info'));
  },
  annuler: async ({ params, locals }) => {
    requireAdmin(locals);
    try {
      await annulerFacture(params.id!);
      await journaliser(locals, { action: 'facture.annulee', cible: { type: 'invoice', id: params.id!, libelle: 'Document annulé' } });
    } catch (e) { return fail(400, { error: e instanceof Error ? e.message : 'Impossible.' }); }
    throw retour(params.id!, 'Document annulé.');
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
    throw retour(params.id!, 'Règlement enregistré.');
  },
  payment_delete: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const id = String((await request.formData()).get('paymentId') ?? '');
    if (id) { await deletePayment(id); await journaliser(locals, { action: 'facture.reglement_retire', cible: { type: 'invoice', id: params.id!, libelle: 'Règlement retiré' } }); }
    throw retour(params.id!, 'Règlement retiré.');
  },
  /** Avoir reprenant cette facture, en brouillon. */
  credit_note: async ({ params, locals }) => {
    requireAdmin(locals);
    const inv = await getInvoice(params.id!);
    if (!inv) throw error(404, { message: 'Facture introuvable' });
    if (inv.kind !== 'invoice') throw retour(params.id!, 'Un avoir ne peut porter que sur une facture.', 'error');
    const ht = inv.price_mode === 'ht';
    const id = await createManualInvoice({
      kind: 'credit_note', bill_to: inv.bill_to, clientId: inv.client_id ?? undefined, customerId: inv.customer_id ?? undefined,
      vat_rate: inv.vat_rate, price_mode: ht ? 'ht' : 'ttc', notes: `Avoir sur la facture n° ${inv.ref}`,
      lines: (inv.lines ?? []).map((l: any) => ({ description: l.description, qty: l.qty, unit_price: ht ? (l.unit_price_ht ?? l.unit_price_ttc) : l.unit_price_ttc, vat_rate: l.vat_rate, book: l.book, isbn: l.isbn }))
    });
    await journaliser(locals, { action: 'facture.brouillon', cible: { type: 'invoice', id, libelle: `Avoir sur ${inv.ref}` } });
    throw redirect(303, withFlash(`/admin/factures/${id}/modifier`, 'Avoir préparé en brouillon : vérifiez, puis émettez.', 'info'));
  }
};
