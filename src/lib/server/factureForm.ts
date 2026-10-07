/** Lecture du formulaire de facture (nouvelle ou brouillon modifié) : un seul endroit. */
import type { ManualInvoiceInput } from './invoice';
import { heureParisVersDate } from '$lib/dates';

export function lireFormulaireFacture(fd: FormData): { input: ManualInvoiceInput; erreur?: string } {
  const S = (k: string) => String(fd.get(k) ?? '').trim();
  let lines: ManualInvoiceInput['lines'] = [];
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
  } catch { lines = []; }
  const jour = S('issued_at');
  const input: ManualInvoiceInput = {
    kind: S('kind') === 'credit_note' ? 'credit_note' : 'invoice',
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
    issued_at: jour ? heureParisVersDate(`${jour}T12:00`) ?? undefined : undefined
  };
  if (!lines.length) return { input, erreur: 'Ajoutez au moins une ligne.' };
  if (!input.bill_to.name) return { input, erreur: 'Le nom du client est requis.' };
  return { input };
}
