/**
 * Calcul des remises (client-safe, sans accès à la base) : une règle de
 * promotion appliquée à un panier, ligne par ligne.
 *
 * Une règle =
 *   - une REMISE : pourcentage ou montant ;
 *   - un PÉRIMÈTRE (ce qui est remisé) : tout le panier, des collections, des
 *     livres, ou le fonds (livres parus depuis plus de N ans) ;
 *   - des CONDITIONS (quand elle s'applique) : commande minimum, au moins N
 *     livres dans le panier, ou un des livres désignés dans le panier ;
 *   - un PLAFOND : au plus N exemplaires remisés (les moins chers d'abord).
 */

export type PerimetreRemise = 'all' | 'collection' | 'book' | 'fond';
export type ConditionRemise = 'none' | 'min_qty' | 'contains';

export interface RegleRemise {
  code: string;
  description?: string;
  type: 'percent' | 'amount';
  value: number;
  scope: PerimetreRemise;
  books: string[];
  collections: string[];
  /** Fonds : parus depuis plus de N ans. */
  fondAns: number;
  minSubtotal?: number;
  condition: ConditionRemise;
  conditionQty?: number;
  conditionBooks: string[];
  /** Libellés des livres de condition (pour les messages). */
  conditionTitres?: string[];
  maxItems?: number;
  auto: boolean;
}

export interface LigneRemise {
  id: string;
  format: string;
  qty: number;
  unit_price: number;
  line_total: number;
  published_at?: string | null;
  collections?: string[];
}

export interface RemiseLigne { id: string; format: string; discount: number }
export type Application = { ok: true; discount: number; lignes: RemiseLigne[] } | { ok: false; erreur: string };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const nu = (x: unknown) => String(x ?? '').replace(/^(book|collection):/, '');
const euro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/** Le livre entre-t-il dans le périmètre de la règle ? */
export function dansPerimetre(r: RegleRemise, l: { id: string; published_at?: string | null; collections?: string[] }, maintenant = new Date()): boolean {
  if (r.scope === 'all') return true;
  if (r.scope === 'book') return r.books.map(nu).includes(nu(l.id));
  if (r.scope === 'collection') { const c = new Set(r.collections.map(nu)); return (l.collections ?? []).some((x) => c.has(nu(x))); }
  if (r.scope === 'fond') {
    if (!l.published_at) return false;
    const limite = new Date(maintenant); limite.setFullYear(limite.getFullYear() - (r.fondAns || 2));
    return new Date(l.published_at) <= limite;
  }
  return false;
}

/** Applique une règle à un panier : remise totale et part de chaque ligne, ou la raison du refus. */
export function appliquerRegle(r: RegleRemise, lignes: LigneRemise[], subtotal: number, maintenant = new Date()): Application {
  if (r.minSubtotal != null && subtotal < r.minSubtotal) return { ok: false, erreur: `Commande minimum de ${euro(r.minSubtotal)} requise.` };
  const qtePanier = lignes.reduce((n, l) => n + l.qty, 0);
  if (r.condition === 'min_qty' && r.conditionQty && qtePanier < r.conditionQty)
    return { ok: false, erreur: `Il faut au moins ${pluriel(r.conditionQty, 'livre')} dans le panier.` };
  if (r.condition === 'contains' && r.conditionBooks.length) {
    const voulus = new Set(r.conditionBooks.map(nu));
    if (!lignes.some((l) => voulus.has(nu(l.id))))
      return { ok: false, erreur: r.conditionTitres?.length ? `Il faut « ${r.conditionTitres.join(' » ou « ')} » dans le panier.` : 'Un livre désigné doit être dans le panier.' };
  }
  // Exemplaires éligibles, un par unité ; plafond : les moins chers d'abord.
  let unites: { cle: string; prix: number }[] = [];
  for (const l of lignes) if (dansPerimetre(r, l, maintenant)) for (let i = 0; i < l.qty; i++) unites.push({ cle: `${nu(l.id)}|${l.format}`, prix: l.unit_price });
  if (r.maxItems && r.maxItems > 0) unites = unites.sort((a, b) => a.prix - b.prix).slice(0, r.maxItems);
  const parLigne = new Map<string, number>();
  for (const u of unites) parLigne.set(u.cle, (parLigne.get(u.cle) ?? 0) + u.prix);
  const eligible = [...parLigne.values()].reduce((a, b) => a + b, 0);
  if (eligible <= 0) return { ok: false, erreur: "Cette promotion ne s'applique à aucun article du panier." };

  const total = r2(Math.min(r.type === 'percent' ? (eligible * r.value) / 100 : Math.min(r.value, eligible), subtotal));
  if (total <= 0) return { ok: false, erreur: 'Remise nulle.' };
  // Répartition au prorata de la part éligible de chaque ligne ; l'arrondi va à la plus grosse.
  const res: RemiseLigne[] = [];
  let reparti = 0;
  for (const [cle, montant] of parLigne) {
    const [id, format] = cle.split('|');
    const d = r2((total * montant) / eligible);
    res.push({ id, format, discount: d }); reparti += d;
  }
  const ecart = r2(total - reparti);
  if (ecart && res.length) { const max = res.reduce((a, b) => (b.discount > a.discount ? b : a)); max.discount = r2(max.discount + ecart); }
  return { ok: true, discount: total, lignes: res.filter((x) => x.discount > 0) };
}

/** La règle remise-t-elle ce livre sans autre condition (prix barré affichable) ? */
export const sansCondition = (r: RegleRemise) => r.condition === 'none' && r.minSubtotal == null && !r.maxItems;

/** Prix remisé d'un exemplaire, pour l'affichage sur la fiche livre. */
export function prixRemise(r: RegleRemise, prix: number): number {
  return r2(Math.max(0, r.type === 'percent' ? prix * (1 - r.value / 100) : prix - Math.min(r.value, prix)));
}

/** Phrase lisible : « −15 % sur le fonds · dès 3 livres · dans la limite de 2 exemplaires ». */
export function decrireRegle(r: RegleRemise): string {
  const remise = r.type === 'percent' ? `−${String(r.value).replace('.', ',')} %` : `−${euro(r.value)}`;
  const sur = r.scope === 'fond' ? ` sur le fonds (parus depuis plus de ${pluriel(r.fondAns || 2, 'an')})`
    : r.scope === 'collection' ? ' sur une sélection de collections' : r.scope === 'book' ? ' sur une sélection de livres' : '';
  const conds: string[] = [];
  if (r.condition === 'min_qty' && r.conditionQty) conds.push(`dès ${pluriel(r.conditionQty, 'livre')} dans le panier`);
  if (r.condition === 'contains' && r.conditionBooks.length) conds.push(r.conditionTitres?.length ? `avec « ${r.conditionTitres.join(' » ou « ')} » dans le panier` : 'avec un livre désigné dans le panier');
  if (r.minSubtotal != null) conds.push(`dès ${euro(r.minSubtotal)} d'achat`);
  if (r.maxItems) conds.push(`dans la limite de ${pluriel(r.maxItems, 'exemplaire')}`);
  return [remise + sur, ...conds].join(' · ');
}
