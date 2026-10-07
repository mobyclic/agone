import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { createManualInvoice, emettreFacture, passerProforma, getCompany } from '$lib/server/invoice';
import { lireFormulaireFacture } from '$lib/server/factureForm';
import { getClientPro } from '$lib/server/clients';
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

/** Le brouillon est créé dans tous les cas ; l'intention décide de la suite. */
async function creer(request: Request, locals: App.Locals, intention: 'brouillon' | 'emettre' | 'proforma') {
  requireAdmin(locals);
  const { input, erreur } = lireFormulaireFacture(await request.formData());
  if (erreur) return fail(400, { error: erreur });
  const id = await createManualInvoice(input);
  let message = 'Brouillon enregistré.';
  try {
    if (intention === 'emettre') { const { ref } = await emettreFacture(id, input.issued_at); message = `${input.kind === 'credit_note' ? 'Avoir' : 'Facture'} ${ref} émis${input.kind === 'credit_note' ? '' : 'e'}.`; }
    else if (intention === 'proforma') { const { ref } = await passerProforma(id); message = `Pro forma ${ref} créée — envoyez-la au client.`; }
  } catch (e) {
    return fail(400, { error: e instanceof Error ? e.message : 'Échec.' });
  }
  await journaliser(locals, { action: intention === 'emettre' ? 'facture.emise' : intention === 'proforma' ? 'facture.proforma' : 'facture.brouillon', cible: { type: 'invoice', id, libelle: input.bill_to.name }, details: { type: input.kind, mode: input.price_mode ?? 'ttc', lignes: input.lines.length, total: input.lines.reduce((s, l) => s + l.qty * l.unit_price, 0) } });
  throw redirect(303, withFlash(`/admin/factures/${id}`, message, 'success'));
}

export const actions: Actions = {
  brouillon: ({ request, locals }) => creer(request, locals, 'brouillon'),
  emettre: ({ request, locals }) => creer(request, locals, 'emettre'),
  proforma: ({ request, locals }) => creer(request, locals, 'proforma')
};
