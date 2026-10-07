import { expect, test } from 'bun:test';
import { rapprocherTitre, formesLibelleMeg } from './titreMeg';

const CATALOGUE = [
  { id: 'a', title: 'La Matrice des classes sociales' }, { id: 'b', title: 'Prendre la parole' }, { id: 'c', title: 'Vivre sans politique' },
  { id: 'd', title: 'Quand les travailleurs sabotaient' }, { id: 'e', title: 'Quand la gauche essayait' }, { id: 'f', title: 'Le Nouvel Esprit du capitalisme' },
  { id: 'g', title: 'L’Opinion, ça se travaille' }, { id: 'h', title: 'Savoir commencer une grève' }, { id: 'i', title: 'Savoir commencer une révolution' }
];

test('article rejeté en fin de libellé', () => {
  expect(formesLibelleMeg("OPINION,CA SE TRAVAILLE (L')")).toEqual(['L OPINION CA SE TRAVAILLE', 'OPINION CA SE TRAVAILLE']);
  expect(rapprocherTitre("OPINION,CA SE TRAVAILLE (L')", CATALOGUE)?.id).toBe('g');
  expect(rapprocherTitre('MATRICE DES CLASSES SOCIALES (LA)', CATALOGUE)?.id).toBe('a');
});

test('libellé tronqué : un seul début de titre possible', () => {
  expect(rapprocherTitre('PRENDRE LA PAR', CATALOGUE)?.id).toBe('b');
  expect(rapprocherTitre('VIVRE SANS POL', CATALOGUE)?.id).toBe('c');
  expect(rapprocherTitre('QUAND LES TRAVAILLEURS SABOTAI', CATALOGUE)?.id).toBe('d');
});

test('ambigu ou trop court : rien', () => {
  expect(rapprocherTitre('SAVOIR COMMENCER UNE', CATALOGUE)).toBeNull(); // grève ou révolution
  expect(rapprocherTitre('LEN', CATALOGUE)).toBeNull();
  expect(rapprocherTitre('QUAND L', CATALOGUE)).toBeNull();
});
