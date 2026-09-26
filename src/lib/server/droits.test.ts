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
let CONTRACTS: any[] = [];    // contrats successifs (avenants), prioritaires sur CONTRACT
let BOOK: any = {};           // livre simulé
let PREV_LINES: any[] = [];   // lignes de l'exercice précédent (provision)
let PREV_CARRY = 0;           // report à nouveau

mock.module(`${R}/surreal.ts`, () => ({
  recId: (t: string, id: string) => `${t}:${id}`,
  query: async (sql: string, vars: any = {}) => {
    if (sql.includes('FROM royalty_contract WHERE author')) return CONTRACTS.length ? CONTRACTS : [CONTRACT];
    // Lignes brutes, avec la période de leur relevé : le moteur les répartit lui-même.
    if (sql.includes('FROM sales_line')) {
      return SALES
        .filter((l) => l.end >= vars.min && (l.start ?? l.end) <= vars.max)
        .map((l) => ({
          format: l.format, units_sold: l.sold, units_returned: l.returned,
          units_export: l.exported ?? 0, gross_price: l.price,
          ps: l.start ?? l.end, pe: l.end
        }));
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

test('ventes hors France : taux réduit de moitié', async () => {
  // 1 000 ex. dont 200 hors France, sans provision pour isoler l'effet du taux.
  CONTRACT = { ...base, advance: 0, advance_recouped: 0 };
  BOOK = { returns_provision_rate: 0 };
  PREV_LINES = []; PREV_CARRY = 0;
  SALES = [{ format: 'paper', sold: 1000, returned: 0, exported: 200, price: null, end: new Date('2026-06-30') }];
  const r = await computeStatementForAuthor('a1', P1, P2);
  eq('unités hors France', r.lines[0].units_export, 200);
  // 800 ex. à 6 % + 200 ex. à 3 % (la moitié du taux)
  eq('brut', r.lines[0].gross, (800 * 0.06 + 200 * 0.03) * PPHT);
});

// ── Contrat arrêté en cours d'année, reconduit à d'autres conditions ────────
// Chaque contrat ne vaut que pour ses ventes : celles de sa période de validité.
const AVENANT_A = { ...base, id: 'royalty_contract:c1', tiers: [{ rate: 6 }], term_end: '2026-06-30T00:00:00Z' };
const AVENANT_B = { ...base, id: 'royalty_contract:c2', tiers: [{ rate: 10 }], term_start: '2026-07-01T00:00:00Z' };

test('avenant en cours d’exercice : chaque contrat sur sa période', async () => {
  CONTRACTS = [AVENANT_A, AVENANT_B];
  BOOK = { returns_provision_rate: 0 }; PREV_LINES = []; PREV_CARRY = 0;
  SALES = [
    { format: 'paper', sold: 1000, returned: 0, price: null, start: new Date('2026-01-01'), end: new Date('2026-03-31') },
    { format: 'paper', sold: 500, returned: 0, price: null, start: new Date('2026-07-01'), end: new Date('2026-09-30') }
  ];
  const r = await computeStatementForAuthor('a1', P1, P2);
  eq('deux lignes, une par contrat', r.lines.length, 2);
  eq('1er semestre au taux d’origine', r.lines[0].gross, 1000 * 0.06 * PPHT);
  eq('2d semestre au taux de l’avenant', r.lines[1].gross, 500 * 0.10 * PPHT);
  eq('total brut', r.gross_total, (1000 * 0.06 + 500 * 0.10) * PPHT);
  expect(r.warnings, 'aucune réserve').toHaveLength(0);
  CONTRACTS = [];
});

test('relevé annuel à cheval sur un avenant : prorata des jours, et on le dit', async () => {
  CONTRACTS = [AVENANT_A, AVENANT_B];
  BOOK = { returns_provision_rate: 0 }; PREV_LINES = []; PREV_CARRY = 0;
  SALES = [{ format: 'paper', sold: 1000, returned: 0, price: null, start: new Date('2026-01-01'), end: new Date('2026-12-31') }];
  const r = await computeStatementForAuthor('a1', P1, P2);
  // 181 jours sur 365 avant l'avenant, 184 après — et pas un exemplaire perdu.
  eq('avant l’avenant', r.lines[0].units, 496);
  eq('après l’avenant', r.lines[1].units, 504);
  eq('total conservé', r.lines[0].units + r.lines[1].units, 1000);
  expect(r.warnings.join(' '), 'réserve sur la répartition').toContain('prorata');
  CONTRACTS = [];
});

test('ventes sans contrat en vigueur : signalées, pas de droits calculés', async () => {
  CONTRACTS = [AVENANT_A];
  BOOK = { returns_provision_rate: 0 }; PREV_LINES = []; PREV_CARRY = 0;
  SALES = [{ format: 'paper', sold: 300, returned: 0, price: null, start: new Date('2026-07-01'), end: new Date('2026-09-30') }];
  const r = await computeStatementForAuthor('a1', P1, P2);
  eq('aucune ligne de droits', r.lines.length, 0);
  expect(r.warnings.join(' '), 'réserve « sans contrat »').toContain('sans contrat en vigueur');
  expect(r.warnings.join(' '), 'nombre d’exemplaires concernés').toContain('300 ex.');
  CONTRACTS = [];
});

test('paliers : l’avenant continue le cumul, sauf s’il repart de zéro', async () => {
  const paliers = [{ up_to: 2000, rate: 6 }, { rate: 10 }];
  BOOK = { returns_provision_rate: 0 }; PREV_LINES = []; PREV_CARRY = 0;
  SALES = [
    { format: 'paper', sold: 1500, returned: 0, price: null, start: new Date('2026-01-01'), end: new Date('2026-03-31') },
    { format: 'paper', sold: 1000, returned: 0, price: null, start: new Date('2026-07-01'), end: new Date('2026-09-30') }
  ];
  CONTRACTS = [{ ...AVENANT_A, tiers: paliers }, { ...AVENANT_B, tiers: paliers }];
  const suite = await computeStatementForAuthor('a1', P1, P2);
  eq('le cumul se poursuit (500 à 6 %, 500 à 10 %)', suite.lines[1].gross, (500 * 0.06 + 500 * 0.10) * PPHT);

  CONTRACTS = [{ ...AVENANT_A, tiers: paliers }, { ...AVENANT_B, tiers: paliers, tiers_reset: true }];
  const remise = await computeStatementForAuthor('a1', P1, P2);
  eq('avenant qui repart de zéro', remise.lines[1].gross, 1000 * 0.06 * PPHT);
  CONTRACTS = [];
});
