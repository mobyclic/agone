import { describe, expect, it } from 'bun:test';
import { appliquerRegle, decrireRegle, prixRemise, type RegleRemise, type LigneRemise } from './promoCalcul';

const base: RegleRemise = { code: 'T', type: 'percent', value: 20, scope: 'all', books: [], collections: [], fondAns: 2, condition: 'none', conditionBooks: [], auto: false };
const maintenant = new Date('2026-10-09');
const L = (id: string, prix: number, qty = 1, extra: Partial<LigneRemise> = {}): LigneRemise => ({ id, format: 'papier', qty, unit_price: prix, line_total: prix * qty, ...extra });

describe('appliquerRegle', () => {
  it('remise sur tout le panier, répartie par ligne', () => {
    const r = appliquerRegle(base, [L('a', 25), L('b', 10, 2)], 45, maintenant);
    expect(r).toMatchObject({ ok: true, discount: 9 });
    if (r.ok) expect(r.lignes).toEqual([{ id: 'a', format: 'papier', discount: 5 }, { id: 'b', format: 'papier', discount: 4 }]);
  });
  it('fonds : seulement les livres assez anciens', () => {
    const r = appliquerRegle({ ...base, scope: 'fond', fondAns: 1 }, [L('vieux', 12, 1, { published_at: '2024-03-01' }), L('neuf', 22, 1, { published_at: '2026-06-01' })], 34, maintenant);
    expect(r).toMatchObject({ ok: true, discount: 2.4 });
  });
  it('condition « au moins 3 livres »', () => {
    const r1 = appliquerRegle({ ...base, condition: 'min_qty', conditionQty: 3 }, [L('a', 10, 2)], 20, maintenant);
    expect(r1).toMatchObject({ ok: false });
    const r2 = appliquerRegle({ ...base, condition: 'min_qty', conditionQty: 3 }, [L('a', 10, 2), L('b', 15)], 35, maintenant);
    expect(r2).toMatchObject({ ok: true, discount: 7 });
  });
  it('condition « tel livre dans le panier », remise sur un autre, dans la limite d’un exemplaire', () => {
    const regle: RegleRemise = { ...base, value: 50, scope: 'book', books: ['cible'], condition: 'contains', conditionBooks: ['declencheur'], maxItems: 1 };
    expect(appliquerRegle(regle, [L('cible', 20, 3)], 60, maintenant)).toMatchObject({ ok: false });
    const r = appliquerRegle(regle, [L('declencheur', 18), L('cible', 20, 3)], 78, maintenant);
    expect(r).toMatchObject({ ok: true, discount: 10 });
  });
  it('plafond : les exemplaires les moins chers d’abord', () => {
    const r = appliquerRegle({ ...base, value: 100, maxItems: 1, condition: 'min_qty', conditionQty: 3 }, [L('a', 20), L('b', 8), L('c', 15)], 43, maintenant);
    expect(r).toMatchObject({ ok: true, discount: 8 }); // « 3 pour 2 » : le moins cher offert
  });
  it('montant : réparti au prorata, total exact', () => {
    const r = appliquerRegle({ ...base, type: 'amount', value: 10 }, [L('a', 7), L('b', 7), L('c', 7)], 21, maintenant);
    expect(r.ok && r.lignes.reduce((n, l) => n + l.discount, 0)).toBe(10);
  });
});

describe('affichage', () => {
  it('décrit la règle et calcule le prix barré', () => {
    expect(decrireRegle({ ...base, scope: 'fond', fondAns: 1, condition: 'min_qty', conditionQty: 3, maxItems: 2 })).toBe('−20 % sur le fonds (parus depuis plus de 1 an) · dès 3 livres dans le panier · dans la limite de 2 exemplaires');
    expect(prixRemise(base, 23)).toBe(18.4);
  });
});
