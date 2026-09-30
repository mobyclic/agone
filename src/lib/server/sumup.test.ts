/**
 * Rapprochement SumUp — la décomposition d'un montant sur des candidats et la
 * décision auto / à traiter (bun test). La base et l'API sont simulées.
 */
import { expect, mock, test } from 'bun:test';

const R = '.';
let EVENTS: any[] = [];
let BOOKS: any[] = [];
let CATALOGUE: any[] = [];
const UPDATES: any[] = [];

mock.module('$env/dynamic/private', () => ({ env: { SUMUP_API_KEY: 'sup_sk_test' } }));
mock.module(`${R}/site.ts`, () => ({ getSetting: async () => null, setSetting: async () => {} }));
mock.module(`${R}/canaux.ts`, () => ({ getCanal: async () => ({ id: 'c1', code: 'sumup' }) }));
mock.module(`${R}/droits.ts`, () => ({ createReport: async () => 'r1', deleteReport: async () => {} }));
mock.module(`${R}/surreal.ts`, () => ({
  recId: (t: string, id: string) => `${t}:${id}`,
  query: async (sql: string, vars: any = {}) => {
    if (sql.includes('FROM ONLY $id')) return { amount: vars.__amount ?? TX.amount, at: TX.at, status: 'SUCCESSFUL' };
    if (sql.includes('FROM event WHERE')) return EVENTS;
    if (sql.includes('FROM book WHERE id IN')) return BOOKS.filter((b) => vars.ids.includes(b.id));
    if (sql.includes("FROM book WHERE status = 'published'")) return CATALOGUE;
    if (sql.startsWith('UPDATE')) { UPDATES.push({ sql, vars }); return []; }
    return [];
  }
}));
let TX = { amount: 0, at: '2026-05-12T18:30:00Z' };
const { rapprocher } = await import(`${R}/sumup.ts`);

const livre = (id: string, title: string, price: number) => ({ id: `book:${id}`, title, price_paper: price });

test('un seul titre au bon prix ce soir-là : rapproché d’office', async () => {
  EVENTS = [{ id: 'event:e1', title: 'Rencontre', books: ['book:a'], authors: [] }];
  BOOKS = [livre('a', 'Titre A', 12)];
  TX = { amount: 24, at: '2026-05-12T18:30:00Z' };
  UPDATES.length = 0;
  expect(await rapprocher('t1')).toBe('auto');
  const u = UPDATES.at(-1);
  expect(u.sql).toContain("etat = 'auto'");
  expect(u.vars.items).toEqual([{ book: 'book:a', qty: 2, price: 12, title: 'Titre A' }]);
  expect(u.vars.ev).toBe('event:e1');
});

test('deux lectures possibles (2 × A ou B) : à traiter, avec les deux propositions', async () => {
  EVENTS = [{ id: 'event:e1', title: 'Rencontre', books: ['book:a', 'book:b'], authors: [] }];
  BOOKS = [livre('a', 'Titre A', 12), livre('b', 'Titre B', 24)];
  TX = { amount: 24, at: '2026-05-12T18:30:00Z' };
  UPDATES.length = 0;
  expect(await rapprocher('t2')).toBe('a_traiter');
  const u = UPDATES.at(-1);
  expect(u.vars.s.map((p: any) => p.libelle).sort()).toEqual(['Titre A × 2', 'Titre B']);
});

test('deux titres différents dont la somme fait le montant', async () => {
  EVENTS = [{ id: 'event:e1', title: 'Rencontre', books: ['book:a', 'book:b'], authors: [] }];
  BOOKS = [livre('a', 'Titre A', 12), livre('b', 'Titre B', 19.5)];
  TX = { amount: 31.5, at: '2026-05-12T18:30:00Z' };
  UPDATES.length = 0;
  expect(await rapprocher('t3')).toBe('auto');
  expect(UPDATES.at(-1).vars.items.map((i: any) => i.book)).toEqual(['book:a', 'book:b']);
});

test('pas de rencontre ce jour-là : le catalogue ne fait que proposer', async () => {
  EVENTS = [];
  CATALOGUE = [livre('x', 'Titre X', 15), livre('y', 'Titre Y', 15), livre('z', 'Titre Z', 30)];
  TX = { amount: 30, at: '2026-05-13T10:00:00Z' };
  UPDATES.length = 0;
  expect(await rapprocher('t4')).toBe('a_traiter');
  const s = UPDATES.at(-1).vars.s;
  expect(s.every((p: any) => p.origine === 'catalogue')).toBe(true);
  expect(s.map((p: any) => p.libelle).sort()).toEqual(['Titre X × 2', 'Titre Y × 2', 'Titre Z']);
});
