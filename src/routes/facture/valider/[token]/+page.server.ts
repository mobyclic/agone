import type { PageServerLoad, Actions } from './$types';
import { proformaParToken, validerProforma } from '$lib/server/factureMail';

/** Page publique, atteinte par le lien de l'e-mail : la proforma, et le bouton pour la valider. */
export const load: PageServerLoad = async ({ params }) => {
  const p = await proformaParToken(params.token);
  if (!p) return { proforma: null };
  return {
    proforma: {
      ref: p.proforma_ref ?? p.ref, issued_at: p.issued_at, total_ttc: p.total_ttc, subtotal_ht: p.subtotal_ht, tax_total: p.tax_total,
      name: p.bill_to?.name, lines: (p.lines ?? []).map((l: any) => ({ description: l.description, qty: l.qty, total: l.line_total_ttc })),
      validee: p.status !== 'proforma', facture_ref: p.status !== 'proforma' ? p.ref : null
    }
  };
};

export const actions: Actions = {
  valider: async ({ params }) => {
    const r = await validerProforma(params.token);
    return { ...r };
  }
};
