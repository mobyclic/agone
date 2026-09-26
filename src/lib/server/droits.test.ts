/**
 * Moteur de droits d'auteur — vérification du calcul (bun test).
 *
 * La base est simulée, le code testé est le vrai. Les cas reprennent les clauses
 * des contrats Agone : paliers 6/8/10 % sur le prix public HT, provision sur
 * retours reprise l'exercice suivant, à-valoir amorti, seuil de 100 € avec report,
 * et numérique calculé sur le prix réellement payé.
 */
import { expect, mock, test } from 'bun:test';

const R = '.';
let SALES: any[] = [];        // lignes de vente simulées
let CONTRACT: any = {};       // contrat simulé
let BOOK: any = {};           // livre simulé
let PREV_LINES: any[] = [];   // lignes de l'exercice précédent (provision)
let PREV_CARRY = 0;           // report à nouveau

mock.module(`${R}/surreal.ts`, () => ({
  recId: (t: string, id: string) => `${t}:${id}`,
  query: async (sql: string, vars: any = {}) => {
    if (sql.includes('FROM royalty_contract WHERE author')) return [CONTRACT];
    if (sql.includes('FROM sales_line')) {
      // filtre temporel : avant la période, ou dans la période
      const dans = (l: any) =>
        vars.before ? l.end < vars.before : l.end >= vars.from && l.end <= vars.to;
      const par = new Map<string, any>();
      for (const l of SALES.filter(dans)) {
        const e = par.get(l.format) ?? { format: l.format, sold: 0, returned: 0, revenue_ttc: 0, priced_units: 0 };
        e.sold += l.sold; e.returned += l.returned;
        if (l.price != null) { e.revenue_ttc += (l.sold - l.returned) * l.price; e.priced_units += l.sold - l.returned; }
        par.set(l.format, e);
      }
      return [...par.values()];
    }
    if (sql.includes('returns_provision_rate AS r')) return [{ r: BOOK.returns_provision_rate }];
    if (sql.includes('SELECT lines FROM royalty_statement')) return PREV_LINES.length ? [{ lines: PREV_LINES }] : [];
    if (sql.includes('SELECT carry_out FROM royalty_statement')) return [{ carry_out: PREV_CARRY }];
    return [];
  }
}));
mock.module(`${R}/site.ts`, () => ({
  getSetting: async () => ({ provision_rate: 15, threshold: 100 }),
  setSetting: async () => {}
}));

const { tieredRoyalty, computeStatementForAuthor } = await import(`${R}/droits.ts`);

/** Comparaison au centime près. */
const eq = (nom: string, obtenu: any, attendu: any) =>
  expect(Number(obtenu), nom).toBeCloseTo(Number(attendu), 2);

// Contrat Guéneau : 6 % ≤2000, 8 % ≤5000, 10 % au-delà, sur le prix public HT.
const TIERS = [{ up_to: 2000, rate: 6 }, { up_to: 5000, rate: 8 }, { rate: 10 }];
const PPHT = 20 / 1.055; // livre à 20 € TTC, TVA 5,5 %

test('barème à paliers', () => {
eq('2 500 ex. depuis zéro', tieredRoyalty(0, 2500, TIERS, PPHT).gross, (2000 * 0.06 + 500 * 0.08) * PPHT);
eq('1 000 ex. avec 4 500 déjà vendus', tieredRoyalty(4500, 1000, TIERS, PPHT).gross, (500 * 0.08 + 500 * 0.10) * PPHT);
eq('100 ex. au-delà du dernier palier', tieredRoyalty(9000, 100, TIERS, PPHT).gross, 100 * 0.10 * PPHT);
});

const P1 = new Date('2026-01-01'), P2 = new Date('2026-12-31');
const base = { id: 'royalty_contract:c1', book: 'book:b1', book_title: 'Test', role: 'author',
  tiers: TIERS, scope: 'paper', base: 'ppht', net_rate: 60, price_paper: 20, price_ebook: 12, vat_rate: 5.5 };

test('reddition : provision et brut', async () => {
CONTRACT = { ...base, advance: 0, advance_recouped: 0 };
BOOK = {}; PREV_LINES = []; PREV_CARRY = 0;
SALES = [{ format: 'paper', sold: 1000, returned: 50, price: null, end: new Date('2026-06-30') }];
const r0 = await computeStatementForAuthor('a1', P1, P2);
eq('unités retenues (1000 − 50 − 150 de provision)', r0.lines[0].units, 800);
eq('brut', r0.lines[0].gross, 800 * 0.06 * PPHT);
eq('à payer', r0.payable, r0.total_due);

});
test('à-valoir imputé sur le brut', async () => {
CONTRACT = { ...base, advance: 500, advance_recouped: 0 };
const r = await computeStatementForAuthor('a1', P1, P2);
eq('à-valoir imputé', r.advance_applied, 500);
eq('net = brut − à-valoir', r.total_due, r.gross_total - 500);

});
test('provision reprise l’exercice suivant', async () => {
PREV_LINES = [{ contract: 'royalty_contract:c1', units_provision: 150 }];
CONTRACT = { ...base, advance: 0, advance_recouped: 0 };
SALES = [{ format: 'paper', sold: 200, returned: 20, price: null, end: new Date('2026-06-30') }];
const r = await computeStatementForAuthor('a1', P1, P2);
eq('unités (200 − 20 − 30 + 150 reprises)', r.lines[0].units, 300);

});
test('retours supérieurs aux ventes : dette', async () => {
PREV_LINES = []; SALES = [{ format: 'paper', sold: 0, returned: 300, price: null, end: new Date('2026-06-30') }];
const r = await computeStatementForAuthor('a1', P1, P2);
eq('unités négatives', r.lines[0].units, -300);
eq('brut négatif', r.lines[0].gross < 0 ? 1 : 0, 1);
eq('rien à payer', r.payable, 0);
eq('report négatif', r.carry_out, r.total_due);

});
test('seuil de paiement et report à nouveau', async () => {
SALES = [{ format: 'paper', sold: 100, returned: 0, price: null, end: new Date('2026-06-30') }];
PREV_CARRY = 0;
const r = await computeStatementForAuthor('a1', P1, P2);
eq('sous le seuil : rien à payer', r.payable, 0);
eq('sous le seuil : tout est reporté', r.carry_out, r.total_due);
PREV_CARRY = 90;
const r2 = await computeStatementForAuthor('a1', P1, P2);
eq('report repris dans le dû', r2.total_due, r2.gross_total + 90);

});
test('numérique : prix réellement payé', async () => {
CONTRACT = { ...base, scope: 'ebook', tiers: [{ rate: 25 }], advance: 0, advance_recouped: 0 };
PREV_CARRY = 0;
SALES = [{ format: 'ebook', sold: 100, returned: 0, price: 9.99, end: new Date('2026-06-30') }];
const r = await computeStatementForAuthor('a1', P1, P2);
eq('assiette = prix payé HT', r.lines[0].base_amount, 9.99 / 1.055);
eq('numérique : aucune provision (100 ex.)', r.lines[0].units_provision, 0);
eq('brut = 25 % × 100 ex.', r.lines[0].gross, 100 * 0.25 * (9.99 / 1.055));
});
test('provision propre au livre', async () => {
CONTRACT = { ...base, advance: 0, advance_recouped: 0 };
BOOK = { returns_provision_rate: 0 };
SALES = [{ format: 'paper', sold: 1000, returned: 0, price: null, end: new Date('2026-06-30') }];
const r = await computeStatementForAuthor('a1', P1, P2);
eq('provision désactivée pour ce livre', r.lines[0].units, 1000);
});
