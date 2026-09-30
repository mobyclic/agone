/**
 * Import de commandes depuis un tableur : regroupement des lignes en commandes,
 * livres retrouvés par ISBN ou titre, dates lues dans tous les formats (bun test).
 */
import { expect, mock, test } from 'bun:test';

const R = '.';
const LIVRES = [
  { id: 'book:a', title: 'Titre A', isbn_paper: '9782748900011', price_paper: 12, price_ebook: 8 },
  { id: 'book:b', title: 'Titre B', isbn_paper: '9782748900028', price_paper: 20 }
];
mock.module(`${R}/surreal.ts`, () => ({ recId: (t: string, id: string) => `${t}:${id}`, query: async () => LIVRES }));
mock.module(`${R}/order.ts`, () => ({ createAdminOrder: async () => ({ id: 'x', number: 1 }) }));
const { construireCommandes, dateDe, devinerChampCommande } = await import(`${R}/importCommandes.ts`);

const lecture = (entetes: string[], lignes: any[][]) =>
  ({ token: 't', nomFichier: 'f.xlsx', feuilles: ['1'], feuille: '1', entetes, lignes, apercu: [], proposition: {}, expire: 0 }) as any;
const opts = { channel: 'comptoir', status: 'paid', paymentMethod: 'sumup', placedAt: new Date('2026-05-12T10:00:00Z'), silencieux: true };

test('les intitulés sont reconnus', () => {
  expect(['Date', 'ISBN', 'Titre', 'Qté', 'Prix TTC', 'Email', 'Paiement'].map(devinerChampCommande))
    .toEqual(['date', 'isbn', 'title', 'qty', 'unit_price', 'email', 'payment']);
});

test('dates Excel, ISO et françaises', () => {
  expect(dateDe(46154)?.toISOString().slice(0, 10)).toBe('2026-05-12');
  expect(dateDe('2026-05-12')?.toISOString().slice(0, 10)).toBe('2026-05-12');
  expect(dateDe('12/05/2026')?.toISOString().slice(0, 10)).toBe('2026-05-12');
  expect(dateDe('')).toBeNull();
});

test('une commande par ligne sans client ; même référence = une commande ; titre sans ISBN', async () => {
  const l = lecture(['Ref', 'ISBN', 'Titre', 'Qté', 'Prix', 'Paiement'], [
    ['A1', '9782748900011', '', 2, '', 'espèces'],
    ['A1', '', 'Titre B', 1, 15, ''],
    ['', '', 'Titre A', '', 0, 'CB'],
    ['', '000', 'Inconnu', 1, 5, '']
  ]);
  const { commandes, ignorees } = await construireCommandes(l, { 0: 'ref', 1: 'isbn', 2: 'title', 3: 'qty', 4: 'unit_price', 5: 'payment' }, opts);
  expect(ignorees).toBe(1);
  expect(commandes.length).toBe(2);
  const a1 = commandes.find((c: any) => c.cle === 'A1');
  expect(a1.payment).toBe('especes');
  expect(a1.lines.map((x: any) => [x.bookId, x.qty, x.unit_price])).toEqual([['a', 2, 12], ['b', 1, 15]]);
  const seule = commandes.find((c: any) => c.cle !== 'A1');
  expect(seule.payment).toBe('sumup');
  expect(seule.lines[0]).toMatchObject({ bookId: 'a', qty: 1, unit_price: 0 });
});

test('même client le même jour = une commande', async () => {
  const l = lecture(['Date', 'Email', 'ISBN'], [
    ['12/05/2026', 'x@y.fr', '9782748900011'],
    ['12/05/2026', 'X@Y.fr', '9782748900028'],
    ['13/05/2026', 'x@y.fr', '9782748900028']
  ]);
  const { commandes } = await construireCommandes(l, { 0: 'date', 1: 'email', 2: 'isbn' }, opts);
  expect(commandes.length).toBe(2);
  expect(commandes[0].lines.length).toBe(2);
  expect(commandes[0].email).toBe('x@y.fr');
});
