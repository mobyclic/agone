import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import {
  getOrderByNumber, setOrderStatus, ORDER_STATUSES, TRANSPORTEURS, setOrderTracking, setOrderNotes, refundOrder
} from '$lib/server/order';
import { getInvoiceIdForOrder, createInvoiceForOrder } from '$lib/server/invoice';
import { sendOrderConfirmation } from '$lib/server/orderMail';
import { withFlash } from '$lib/toasts';

const bareId = (v: unknown) => String(v).replace(/^order:/, '');
const retour = (n: string, message: string, type: 'success' | 'error' | 'info' = 'success') =>
  redirect(303, withFlash(`/admin/commandes/${n}`, message, type));

export const load: PageServerLoad = async ({ params }) => {
  const order = await getOrderByNumber(Number(params.number));
  if (!order) throw error(404, { message: 'Commande introuvable' });
  const invoiceId = await getInvoiceIdForOrder(bareId(order.id));
  return { order, invoiceId, transporteurs: TRANSPORTEURS };
};

export const actions: Actions = {
  status: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const status = String(fd.get('status') ?? '');
    if (!(ORDER_STATUSES as readonly string[]).includes(status)) return fail(400, { error: 'Statut invalide.' });
    await setOrderStatus(Number(params.number), status);
    throw retour(params.number!, status === 'completed' ? 'Statut mis à jour — le client est prévenu si sa commande est papier.' : 'Statut mis à jour.');
  },

  generate_invoice: async ({ params, locals }) => {
    requireAdmin(locals);
    const order = await getOrderByNumber(Number(params.number));
    if (order) await createInvoiceForOrder(bareId(order.id));
    throw retour(params.number!, 'Facture générée.');
  },

  /** Suivi de colis ; « prévenir » envoie (ou renvoie) l'avis d'expédition. */
  tracking: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const prevenir = fd.get('prevenir') === 'on';
    const r = await setOrderTracking(Number(params.number), {
      carrier: String(fd.get('carrier') ?? ''),
      tracking_number: String(fd.get('tracking_number') ?? ''),
      tracking_url: String(fd.get('tracking_url') ?? '')
    }, prevenir);
    if (!r.ok) return fail(400, { error: `Suivi enregistré, mais l’email n’est pas parti : ${r.error}` });
    throw retour(params.number!, prevenir ? 'Suivi enregistré et client prévenu.' : 'Suivi enregistré.');
  },

  notes: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    await setOrderNotes(Number(params.number), String(fd.get('notes') ?? ''));
    throw retour(params.number!, 'Notes enregistrées.');
  },

  resend_confirmation: async ({ params, locals }) => {
    requireAdmin(locals);
    const order = await getOrderByNumber(Number(params.number));
    if (!order) throw error(404, { message: 'Commande introuvable' });
    const r = await sendOrderConfirmation(bareId(order.id), { force: true });
    if (!r.ok) return fail(400, { error: `Envoi impossible : ${r.error}` });
    throw retour(params.number!, 'Confirmation renvoyée au client.');
  },

  refund: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const montant = Number(String(fd.get('montant') ?? '').replace(',', '.')) || undefined;
    try {
      const r = await refundOrder(Number(params.number), montant);
      if (!r.ok) return fail(400, { error: r.error });
      throw retour(params.number!, `Remboursement de ${r.montant.toFixed(2).replace('.', ',')} € effectué.`);
    } catch (e) {
      if ((e as any)?.status === 303) throw e;
      return fail(502, { error: `Stripe : ${e instanceof Error ? e.message : 'échec'}` });
    }
  }
};
