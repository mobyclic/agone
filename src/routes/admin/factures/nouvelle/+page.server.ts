import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { createManualInvoice, getCompany } from '$lib/server/invoice';
import { getClientPro } from '$lib/server/clients';
import { heureParisVersDate } from '$lib/dates';
import { withFlash } from '$lib/toasts';
import { journaliser } from '$lib/server/journal';

export const load: PageServerLoad = async ({ locals, url }) => {
  requireAdmin(locals);
  const company = await getCompany();
  // Arrivée depuis la fiche d'un client professionnel : « Facturé à » est pré-rempli.
  const clientId = url.searchParams.get('client');
  const pro = clientId ? await getClientPro(clientId) : null;
  return { vatRates: company.vat_rates, defaultVat: company.vat_rate, pro };
};

export const actions: Actions = {
  save: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const S = (k: string) => String(fd.get(k) ?? '').trim();

    let lines: { description: string; qty: number; unit_price: number; vat_rate?: number; book?: string; isbn?: string }[] = [];
    try {
      const parsed = JSON.parse(S('lines') || '[]');
      lines = (Array.isArray(parsed) ? parsed : [])
        .map((l: any) => ({
          description: String(l.description || '').trim(),
          qty: Math.max(1, Math.floor(Number(l.qty) || 1)),
          unit_price: Math.max(0, Number(l.unit_price) || 0),
          vat_rate: l.vat_rate != null && l.vat_rate !== '' ? Number(l.vat_rate) : undefined,
          book: l.book ? String(l.book).replace(/^book:/, '') : undefined,
          isbn: l.isbn ? String(l.isbn) : undefined
        }))
        .filter((l: any) => l.description);
    } catch {
      lines = [];
    }
    if (!lines.length) return fail(400, { error: 'Ajoutez au moins une ligne.' });
    if (!S('name')) return fail(400, { error: 'Le nom du client est requis.' });
    const jour = S('issued_at');
    const issued_at = jour ? heureParisVersDate(`${jour}T12:00`) ?? undefined : undefined;

    const id = await createManualInvoice({
      kind: S('kind') === 'credit_note' ? 'credit_note' : S('kind') === 'proforma' ? 'proforma' : 'invoice',
      customerId: S('customerId') || undefined,
      clientId: S('clientId') || undefined,
      price_mode: S('price_mode') === 'ht' ? 'ht' : 'ttc',
      bill_to: {
        name: S('name'), email: S('email') || undefined, address_1: S('address_1') || undefined,
        postcode: S('postcode') || undefined, city: S('city') || undefined, country: S('country') || undefined,
        vat_number: S('vat_number') || undefined, siret: S('siret') || undefined, contact_name: S('contact_name') || undefined
      },
      lines,
      vat_rate: S('vat_rate') ? Number(S('vat_rate').replace(',', '.')) : undefined,
      intro: S('intro') || undefined,
      notes: S('notes') || undefined,
      issued_at
    });
    await journaliser(locals, { action: 'facture.creee', cible: { type: 'invoice', id, libelle: S('name') }, details: { type: S('kind') || 'invoice', mode: S('price_mode') || 'ttc', lignes: lines.length } });
    throw redirect(303, withFlash(`/admin/factures/${id}`, 'Document créé.', 'success'));
  }
};
