import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { getInvoice, updateDraft, emettreFacture, passerProforma, getCompany } from '$lib/server/invoice';
import { lireFormulaireFacture } from '$lib/server/factureForm';
import { withFlash } from '$lib/toasts';
import { journaliser } from '$lib/server/journal';

/** Un brouillon se modifie ici ; tout autre document renvoie à sa fiche. */
export const load: PageServerLoad = async ({ params, locals }) => {
  requireAdmin(locals);
  const doc = await getInvoice(params.id);
  if (!doc) throw error(404, { message: 'Document introuvable' });
  if (doc.status !== 'draft') throw redirect(303, `/admin/factures/${params.id}`);
  const company = await getCompany();
  return { doc, vatRates: company.vat_rates, defaultVat: company.vat_rate };
};

async function enregistrer(request: Request, params: { id: string }, locals: App.Locals, intention: 'brouillon' | 'emettre' | 'proforma') {
  requireAdmin(locals);
  const { input, erreur } = lireFormulaireFacture(await request.formData());
  if (erreur) return fail(400, { error: erreur });
  let message = 'Brouillon enregistré.';
  try {
    await updateDraft(params.id, input);
    if (intention === 'emettre') { const { ref } = await emettreFacture(params.id, input.issued_at); message = `${input.kind === 'credit_note' ? 'Avoir' : 'Facture'} ${ref} émis${input.kind === 'credit_note' ? '' : 'e'}.`; }
    else if (intention === 'proforma') { const { ref } = await passerProforma(params.id); message = `Pro forma ${ref} créée — envoyez-la au client.`; }
  } catch (e) {
    return fail(400, { error: e instanceof Error ? e.message : 'Échec.' });
  }
  await journaliser(locals, { action: intention === 'emettre' ? 'facture.emise' : intention === 'proforma' ? 'facture.proforma' : 'facture.brouillon', cible: { type: 'invoice', id: params.id, libelle: input.bill_to.name }, details: { lignes: input.lines.length } });
  throw redirect(303, withFlash(`/admin/factures/${params.id}`, message, 'success'));
}

export const actions: Actions = {
  brouillon: ({ request, params, locals }) => enregistrer(request, params as { id: string }, locals, 'brouillon'),
  emettre: ({ request, params, locals }) => enregistrer(request, params as { id: string }, locals, 'emettre'),
  proforma: ({ request, params, locals }) => enregistrer(request, params as { id: string }, locals, 'proforma')
};
