import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff, requireAdmin } from '$lib/server/access';
import { createManualInvoice, getCompany } from '$lib/server/invoice';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ locals }) => {
  requireStaff(locals);
  const company = await getCompany();
  return { vatRates: company.vat_rates, defaultVat: company.vat_rate };
};

export const actions: Actions = {
  save: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const S = (k: string) => String(fd.get(k) ?? '').trim();

    let lines: { description: string; qty: number; unit_price_ttc: number; vat_rate?: number }[] = [];
    try {
      const parsed = JSON.parse(S('lines') || '[]');
      lines = (Array.isArray(parsed) ? parsed : [])
        .map((l: any) => ({
          description: String(l.description || '').trim(),
          qty: Math.max(1, Math.floor(Number(l.qty) || 1)),
          unit_price_ttc: Math.max(0, Number(l.unit_price_ttc) || 0),
          vat_rate: l.vat_rate != null && l.vat_rate !== '' ? Number(l.vat_rate) : undefined
        }))
        .filter((l: any) => l.description);
    } catch {
      lines = [];
    }
    if (!lines.length) return fail(400, { error: 'Ajoutez au moins une ligne.' });
    if (!S('name')) return fail(400, { error: 'Le nom du client est requis.' });

    const id = await createManualInvoice({
      kind: S('kind') === 'credit_note' ? 'credit_note' : 'invoice',
      customerId: S('customerId') || undefined,
      bill_to: {
        name: S('name'), email: S('email') || undefined, address_1: S('address_1') || undefined,
        postcode: S('postcode') || undefined, city: S('city') || undefined, country: S('country') || undefined
      },
      lines,
      vat_rate: S('vat_rate') ? Number(S('vat_rate').replace(',', '.')) : undefined,
      notes: S('notes') || undefined
    });
    throw redirect(303, withFlash(`/admin/factures/${id}`, 'Document créé.', 'success'));
  }
};
