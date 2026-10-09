import { describe, expect, it } from 'bun:test';
import { calculerLignesVente } from './facturesVentesCalcul';

const prix = new Map([['b1', { price_paper: 15, vat_rate: 5.5, isbn_paper: '9782748905663' }], ['b2', { price_paper: 8, vat_rate: 5.5 }]]);

describe('calculerLignesVente', () => {
  it('une ligne par titre, totaux HT au prix public et au net facturé', () => {
    const l = calculerLignesVente('invoice', [
      { book: 'book:b1', qty: 2, unit_price_ht: 10, unit_price_ttc: 10.55, vat_rate: 5.5 },
      { book: 'b1', qty: 1, unit_price_ht: 10, unit_price_ttc: 10.55, vat_rate: 5.5 },
      { book: 'b2', qty: 3, unit_price_ht: 7.58, unit_price_ttc: 8, vat_rate: 5.5 },
      { book: null, qty: 1, unit_price_ht: 50, unit_price_ttc: 60, vat_rate: 20 } // ligne libre : ignorée
    ], prix);
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ book: 'b1', isbn: '9782748905663', units_sold: 3, units_returned: 0, gross_price: 10.55, gross_ht: 42.65, net_receipt: 30 });
    expect(l[1]).toMatchObject({ book: 'b2', units_sold: 3, gross_ht: 22.75, net_receipt: 22.74 });
  });
  it('un avoir rend des retours', () => {
    const l = calculerLignesVente('credit_note', [{ book: 'b1', qty: 2, unit_price_ht: 10, unit_price_ttc: 10.55 }], prix);
    expect(l[0]).toMatchObject({ units_sold: 0, units_returned: 2, net_receipt: 20 });
  });
});
