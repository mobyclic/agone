import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { rapprochementMois, qualifierEcart, KIND_ECART, type KindEcart } from '$lib/server/rapprochement';
import { journaliser } from '$lib/server/journal';
import { withFlash } from '$lib/toasts';

/** Mois demandé (?mois=AAAA-MM), sinon le mois précédent (le courant n'est pas clos chez BLDD). */
export const load: PageServerLoad = async ({ url, locals }) => {
  requireAdmin(locals);
  const m = /^(\d{4})-(\d{2})$/.exec(url.searchParams.get('mois') ?? '');
  const prec = new Date(); prec.setDate(1); prec.setMonth(prec.getMonth() - 1);
  const annee = m ? Number(m[1]) : prec.getFullYear();
  const mois = m ? Number(m[2]) : prec.getMonth() + 1;
  // Les douze derniers mois à choisir.
  const choix: string[] = [];
  for (let i = 0; i < 14; i++) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); choix.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
  try {
    const r = await rapprochementMois(annee, mois);
    return { annee, mois, choix, rapprochement: r, erreur: null as string | null, kinds: KIND_ECART };
  } catch (e) {
    return { annee, mois, choix, rapprochement: null, erreur: e instanceof Error ? e.message : 'Extranet Belles Lettres injoignable.', kinds: KIND_ECART };
  }
};

export const actions: Actions = {
  /** Qualifie une part de l'écart d'un titre : nature + exemplaires (0 retire). */
  qualifier: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const S = (k: string) => String(fd.get(k) ?? '').trim();
    const annee = Number(S('annee')), mois = Number(S('mois')), qty = Number(S('qty').replace(',', '.'));
    const kind = S('kind') as KindEcart;
    if (!S('book') || !annee || !mois || !KIND_ECART[kind] || !Number.isFinite(qty)) return fail(400, { error: 'Qualification incomplète.' });
    await qualifierEcart(annee, mois, S('book'), kind, qty, S('note'));
    await journaliser(locals, { action: 'bldd.ecart', cible: { type: 'book', id: S('book') }, details: { annee, mois, kind, qty } });
    throw redirect(303, withFlash(`/admin/droits/rapprochement?mois=${annee}-${String(mois).padStart(2, '0')}`, qty ? `${qty} ex. qualifiés : ${KIND_ECART[kind]}.` : 'Qualification retirée.', 'success'));
  }
};
