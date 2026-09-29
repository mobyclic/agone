/** Zoom d'ouverture d'une fiche selon le pays : le Plan IGN s'arrête tôt hors de France. */
import { expect, test } from 'bun:test';
import { zoomLisible } from './map-tiles';

test('zoom lisible : plein en France, 10 chez les voisins, 7 plus loin', () => {
  expect(zoomLisible('France', 13)).toBe(13);
  expect(zoomLisible('fr', 14)).toBe(14);
  expect(zoomLisible(undefined, 13)).toBe(13);          // pays inconnu : on suppose la France
  expect(zoomLisible('Belgique', 13)).toBe(10);
  expect(zoomLisible(' Suisse ', 14)).toBe(10);
  expect(zoomLisible('Portugal', 13)).toBe(7);
  expect(zoomLisible('Canada', 13)).toBe(7);
  expect(zoomLisible('Belgique', 8)).toBe(8);           // jamais plus serré que demandé
});
