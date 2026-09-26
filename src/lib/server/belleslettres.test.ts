/**
 * Lecture de l'« État des ventes et retours » de l'extranet BLDD.
 *
 * Le gabarit ci-dessous reprend la structure réelle de la page (lignes de
 * synthèse, en-têtes, puis une ligne par ISBN). Vérifié en conditions réelles :
 * sur l'exercice 2026, les totaux du parseur tombent au centime sur le tableau
 * de synthèse de BLDD (21 371 vendus, 3 377 retours, 311 891,60 € prix public HT,
 * 194 592,50 € facturés).
 */
import { expect, mock, test } from 'bun:test';

// Le module lit la configuration du serveur au chargement : on la simule pour
// pouvoir exercer le parseur seul, sans SvelteKit ni réseau.
mock.module('$env/dynamic/private', () => ({ env: {} }));
const { parseBlSalesHtml } = await import('./belleslettres');

const PAGE = `
<table>
  <tr><td>ETAT DES VENTES ET RETOURS</td><td>Télécharger sous Excel</td></tr>
  <tr><td>TABLEAU DE SYNTHESE</td><td>Nbre</td><td>CA Prix public HT</td></tr>
  <tr><td>Ventes</td><td>21371</td><td>373993,44</td></tr>
  <tr><td>Retours</td><td>-3377</td><td>-62101,84</td></tr>
  <tr><td>Auteur</td><td>ISBN</td><td>Titre</td><td>Ventes</td><td>Retours</td><td>Vente</td><td>Retour</td><td>Net</td><td>Facture</td></tr>
  <tr><td>Zinn Howard</td><td>9782910846794</td><td>UNE HISTOIRE POPULAIRE DES ETATS-UNIS</td><td>1285</td><td>-80</td><td>35910,8</td><td>-2231,5</td><td>33679,3</td><td>21035,99</td></tr>
  <tr><td>COLLECTIF/</td><td>9782910846053</td><td>AGONE 17-1997</td><td>1</td><td>0</td><td>12,51</td><td>0</td><td>12,51</td><td>8,01</td></tr>
</table>`;

test('lit une ligne de vente par ISBN', () => {
  const lignes = parseBlSalesHtml(PAGE);
  expect(lignes).toHaveLength(2);
  const zinn = lignes[0];
  expect(zinn.isbn).toBe('9782910846794');
  expect(zinn.units_sold).toBe(1285);
  expect(zinn.units_returned).toBe(80); // rendu positif : les retours sont comptés à part
  expect(zinn.net_ht).toBeCloseTo(33679.3, 2);
  expect(zinn.invoiced_ht).toBeCloseTo(21035.99, 2); // après remise libraire
});

test('écarte les lignes de synthèse et d’en-tête', () => {
  // « Ventes / 21371 / 373993,44 » n'a pas d'ISBN : elle ne doit pas devenir une vente.
  expect(parseBlSalesHtml(PAGE).some((l) => l.units_sold === 21371)).toBe(false);
});
