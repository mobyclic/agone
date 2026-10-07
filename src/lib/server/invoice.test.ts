/**
 * Facturation — prix saisis HT ou TTC : ce qui est enregistré sur chaque ligne et
 * dans les totaux (bun test). La base est simulée ; on relit ce qui serait créé.
 */
import { expect, mock, test } from 'bun:test';

const R = '.';
let CREE: any = null;
mock.module(`${R}/surreal.ts`, () => ({
  recId: (t: string, id: string) => `${t}:${id}`,
  query: async (sql: string, vars: any = {}) => {
    if (sql.startsWith('UPDATE site_setting')) return [{ value: { invoice_2026: 12 } }];
    if (sql.startsWith('CREATE invoice')) { CREE = vars.c; return [{ id: 'invoice:x' }]; }
    return [];
  }
}));
mock.module(`${R}/site.ts`, () => ({ getSetting: async () => ({ vat_rate: 5.5, vat_rates: [5.5, 20] }), setSetting: async () => {} }));
mock.module(`${R}/account.ts`, () => ({}));
mock.module(`${R}/promo.ts`, () => ({}));
const { createManualInvoice } = await import(`${R}/invoice.ts`);

test('prix saisis HT : 500 exemplaires à 1,50 € HT, TVA 5,5 %', async () => {
  await createManualInvoice({
    kind: 'invoice', price_mode: 'ht', bill_to: { name: 'Librairie' }, issued_at: new Date('2026-10-07T12:00:00Z'),
    lines: [{ description: '9782748905823 – Les médias contre la gauche', qty: 500, unit_price: 1.5, vat_rate: 5.5, isbn: '9782748905823' }]
  });
  expect(CREE.price_mode).toBe('ht');
  expect(CREE.lines[0].unit_price_ht).toBe(1.5);
  expect(CREE.lines[0].unit_price_ttc).toBe(1.58);
  expect(CREE.lines[0].line_total_ttc).toBe(791.25);
  expect(CREE.subtotal_ht).toBe(750);
  expect(CREE.tax_total).toBe(41.25);
  expect(CREE.total_ttc).toBe(791.25);
  expect(CREE.ref).toBe('2026-0012');
});

test('prix saisis TTC : 2 × 16,00 €, TVA 5,5 %', async () => {
  await createManualInvoice({
    kind: 'invoice', price_mode: 'ttc', bill_to: { name: 'Client' },
    lines: [{ description: 'Après le capitalisme', qty: 2, unit_price: 16, vat_rate: 5.5 }]
  });
  expect(CREE.price_mode).toBe('ttc');
  expect(CREE.lines[0].unit_price_ttc).toBe(16);
  expect(CREE.lines[0].unit_price_ht).toBe(15.17);
  expect(CREE.lines[0].line_total_ttc).toBe(32);
  expect(CREE.subtotal_ht).toBe(30.33);
  expect(CREE.total_ttc).toBe(32);
});
