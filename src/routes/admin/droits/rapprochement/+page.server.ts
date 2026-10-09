import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { rapprochementMois } from '$lib/server/rapprochement';

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
    return { annee, mois, choix, rapprochement: r, erreur: null as string | null };
  } catch (e) {
    return { annee, mois, choix, rapprochement: null, erreur: e instanceof Error ? e.message : 'Extranet Belles Lettres injoignable.' };
  }
};
