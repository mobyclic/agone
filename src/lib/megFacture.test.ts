import { expect, test } from 'bun:test';
import { lireFactureMeg, modeReglement } from './megFacture';

const ACRIMED = `AGONE - 18 BOULEVARD DE PARIS 13003 MARSEILLE FRANCE - Email : compta@agone.org - Site web : http://www.agone.org - Code NAF (APE) 5811Z - Association au capital social de 0 €
- Siret : 38829418300057 - N° TVA FR55388294183
Libellé Qté Unité PU HT Rem. Montant HT TVA
OPINION,CA SE TRAVAILLE (L')9782748902198 -
COLLECTIF
20,00 pc 9,48 € 40,00% 113,76 € 5,50%
Adresse de livraison : C/O Maxime Friot 15 rue de la Taurellerie 35700 RENNES FRANCE
Type de vente : Vente de biens
Détail de la TVA
Code Base HT Taux Montant
Réduite 113,76 € 5,50% 6,26 €
Normale 35,00 € 20,00% 7,00 €
Règlement Virement
Echéance(s) 162,02 € au 31/10/2026
Coordonnées bancaires
Nom CAISSE EPARGNE
IBAN FR7611315000010800413000453
BIC CEPAFRPP131
Total HT 113,76 €
Frais de port HT 35,00 €
Total HT net 148,76 €
TVA 13,26 €
Total TTC 162,02 €
Facture
N° : FAC00000531
Date d'émission : 01/10/2026
N° TVA : NC
N° client : CLT00000087
ACRIMED
MAISON DES ASSOCIATIONS
6 COURS DES ALLIES
35000 RENNES
FRANCE
Port : 06 82 75 59 34
Email : acrimedinfo@gmail.com`;

const AVOIR = `Réf. : Avoir sur la facture numéro FAC00000427
Libellé Qté Unité PU HT Rem. Montant HT TVA
HISTOIRE DE FRANCE POPULAIRE9782748905700 -
Laurence de Cock
-15,00 pc 27,49 € 0,00% -412,35 € 5,50%
Détail de la TVA
Code Base HT Taux Montant
Réduite -412,35 € 5,50% -22,68 €
Règlement Virement
Echéance(s)
réglée(s)
-435,03 € réglée le 21/01/2026 par Virement
Total TTC -435,03 €
Avoir
N° : AVR00000047
Date : 21/01/2026
N° client : CLT00000122
LIBRAIRIE QUILOMBO
23 RUE VOLTAIRE
75011 PARIS`;

test('facture ACRIMED : client, ligne remisée, port, échéance', () => {
  const f = lireFactureMeg(ACRIMED)!;
  expect(f.type).toBe('facture');
  expect(f.ref).toBe('FAC00000531');
  expect(f.date).toBe('2026-10-01');
  expect(f.client).toMatchObject({ numero: 'CLT00000087', nom: 'ACRIMED', adresse: ['MAISON DES ASSOCIATIONS', '6 COURS DES ALLIES'], postcode: '35000', ville: 'RENNES', pays: 'FRANCE', tel: '06 82 75 59 34', email: 'acrimedinfo@gmail.com' });
  expect(f.lignes).toEqual([{ description: "OPINION,CA SE TRAVAILLE (L')", isbn: '9782748902198', code: undefined, auteur: 'COLLECTIF', qty: 20, unite: 'pc', pu_ht: 9.48, remise_pct: 40, montant_ht: 113.76, tva: 5.5 }]);
  expect(f.port_ht).toBe(35);
  expect([f.total_ht, f.total_ht_net, f.tva, f.total_ttc]).toEqual([113.76, 148.76, 13.26, 162.02]);
  expect(f.reglement).toEqual({ mode: 'Virement', echeance_montant: 162.02, echeance: '2026-10-31' });
  expect(f.livraison).toContain('Maxime Friot');
  expect(f.avertissements).toEqual([]);
});

test('avoir réglé : montants négatifs, réglé le … par …, sans Total HT', () => {
  const f = lireFactureMeg(AVOIR)!;
  expect(f.type).toBe('avoir');
  expect(f.intro).toBe('Réf. : Avoir sur la facture numéro FAC00000427');
  expect(f.lignes[0]).toMatchObject({ qty: -15, montant_ht: -412.35, auteur: 'Laurence de Cock' });
  expect(f.total_ht).toBe(-412.35);
  expect(f.total_ttc).toBe(-435.03);
  expect(f.reglement).toMatchObject({ regle_montant: -435.03, regle_le: '2026-01-21', regle_par: 'Virement' });
  expect(modeReglement(f.reglement?.regle_par)).toBe('virement');
});
