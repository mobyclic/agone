/**
 * Panier et frais de port — la mécanique pure (bun test).
 * Le panier vit dans un cookie : on le simule. Les frais de port sont un
 * calcul sans base. Les prix, eux, viennent du catalogue et sont testés ailleurs.
 */
import { expect, mock, test } from 'bun:test';
import { quoteShippingFor, type ShipZone } from '../shipping-calc';

mock.module('./surreal.ts', () => ({ query: async () => [], recId: (t: string, i: string) => `${t}:${i}` }));
const { readCart, addToCart, setQty, removeFromCart, clearCart, cartCount } = await import('./cart');

/** Un jeu de cookies en mémoire, avec la signature qu'attend SvelteKit. */
function faussesCookies() {
  const jar = new Map<string, string>();
  return {
    get: (k: string) => jar.get(k),
    set: (k: string, v: string) => { jar.set(k, v); },
    delete: (k: string) => { jar.delete(k); },
    getAll: () => [], serialize: () => ''
  } as any;
}

test('panier : ajout, cumul, plafond, retrait, vidage', () => {
  const c = faussesCookies();
  addToCart(c, 'book:abc', 'papier', 2);
  addToCart(c, 'abc', 'papier', 3);          // même livre, id nu ou préfixé : une seule ligne
  addToCart(c, 'abc', 'epub');
  expect(readCart(c)).toEqual([{ id: 'abc', format: 'papier', qty: 5 }, { id: 'abc', format: 'epub', qty: 1 }]);
  expect(cartCount(c)).toBe(6);

  addToCart(c, 'abc', 'papier', 200);         // jamais plus de 99 exemplaires d'une ligne
  expect(readCart(c)[0].qty).toBe(99);

  setQty(c, 'book:abc', 'papier', 4);
  expect(readCart(c)[0].qty).toBe(4);
  setQty(c, 'abc', 'epub', 0);                // quantité nulle = ligne retirée
  expect(readCart(c)).toHaveLength(1);

  removeFromCart(c, 'abc', 'papier');
  expect(readCart(c)).toEqual([]);

  addToCart(c, 'x', 'papier');
  clearCart(c);
  expect(cartCount(c)).toBe(0);
});

test('panier : un cookie corrompu ne casse rien', () => {
  const c = faussesCookies();
  c.set('ag_cart', '{pas du json');
  expect(readCart(c)).toEqual([]);
  c.set('ag_cart', JSON.stringify([{ id: 'a', qty: -3 }, { qty: 2 }, { id: 'b', format: 'epub', qty: '2' }]));
  expect(readCart(c)).toEqual([{ id: 'b', format: 'epub', qty: 2 }]);
});

const ZONES: ShipZone[] = [
  { name: 'France', countries: ['FR'], rest_of_world: false, rates: [{ up_to: 500, price: 4.5 }, { up_to: 2000, price: 7 }, { up_to: null, price: 12 }], free_over: 60 },
  { name: 'Europe', countries: ['BE', 'DE'], rest_of_world: false, rates: [{ up_to: 1000, price: 9 }, { up_to: null, price: 15 }] },
  { name: 'Monde', countries: [], rest_of_world: true, rates: [{ up_to: null, price: 25 }] }
];

test('frais de port : paliers de poids, franco, reste du monde, numérique', () => {
  expect(quoteShippingFor(ZONES, 'FR', 300, 20)).toMatchObject({ ok: true, price: 4.5, zone: 'France' });
  expect(quoteShippingFor(ZONES, 'FR', 500, 20).price).toBe(4.5);      // borne incluse
  expect(quoteShippingFor(ZONES, 'FR', 501, 20).price).toBe(7);
  expect(quoteShippingFor(ZONES, 'FR', 5000, 20).price).toBe(12);      // au-delà du dernier plafond
  expect(quoteShippingFor(ZONES, 'FR', 5000, 60).price).toBe(0);       // franco atteint
  expect(quoteShippingFor(ZONES, 'DE', 800, 200).price).toBe(9);       // pas de franco en Europe
  expect(quoteShippingFor(ZONES, 'JP', 100, 20)).toMatchObject({ price: 25, zone: 'Monde' });
  expect(quoteShippingFor(ZONES, 'FR', 0, 20)).toMatchObject({ ok: true, price: 0 }); // rien de physique
  expect(quoteShippingFor(ZONES.slice(0, 2), 'JP', 100, 20).ok).toBe(false);          // pays non desservi
});
