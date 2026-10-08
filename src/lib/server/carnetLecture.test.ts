import { describe, expect, it } from 'bun:test';
import * as XLSX from 'xlsx';
import { lireCarnet, relireCarnet } from './carnetLecture';

function classeur(feuilles: Record<string, any[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [nom, aoa] of Object.entries(feuilles)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), nom);
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

describe('lireCarnet', () => {
  it('lit le carnet d’un salonneur (colonnes CB / Chek / Liquid / SP, deux colonnes Stock)', () => {
    const buf = classeur({
      BLDD: [['ÉDITIONS AGONE'], ['COLLECTION', 'TITRE', 'ISBN', 'PRIX TTC', 'STOCK 1'], ['X', 'Y', '9782748905373', '14.00 €', 5]],
      CarnetVente_Bagnolet: [
        [],
        ['', 'COLLECTION', 'ISBN', 'TITRE', 'PPTTC', 'Stock', 'CB', 'Chek', 'Liquid', 'Ventes', 'SP', 'CA', 'Stock'],
        [1, 'ELEMENTS', '9782748905663', 'ISLAM ET CAPITALISME', '15.00 €', 5, '', '', 1, 1, '', '15.00 €', 4],
        [2, 'ELEMENTS', '9782748904901', 'LA MACHINE', '10.00 €', 12, '', '', '', '', 12, '0.00 €', 0],
        [3, 'ELEMENTS', '9782748905328', 'PEDAGOGIE', '12.00 €', 10, 5, '', '', 5, '', '60.00 €', 5],
        ['', '', '', 'Totaux', '', '', '', '', '', 6, 12, '', '']
      ]
    });
    const l = lireCarnet(buf, 'oscaruben.xls');
    expect(l.feuille).toBe('CarnetVente_Bagnolet'); // la feuille « carnet » est préférée à la première
    expect(l.lignes).toHaveLength(3);
    expect(l.lignes[0]).toMatchObject({ isbn: '9782748905663', prix: 15, stock_debut: 5, especes: 1, ventes: 1, sp: 0, stock_fin: 4 });
    expect(l.lignes[1]).toMatchObject({ ventes: 0, sp: 12, stock_fin: 0 });
    expect(l.lignes[2]).toMatchObject({ cb: 5, ventes: 5, stock_fin: 5 });
    // Relecture sur une autre feuille, même fichier
    const l2 = relireCarnet(l.token, 'BLDD')!;
    expect(l2.feuille).toBe('BLDD');
    expect(l2.lignes[0]).toMatchObject({ isbn: '9782748905373', prix: 14, stock_debut: 5, ventes: 0 });
  });
  it('calcule les ventes depuis CB + chèque + espèces quand la colonne Ventes manque', () => {
    const buf = classeur({ Carnet: [['ISBN', 'Titre', 'PPTTC', 'Stock début', 'CB', 'Chèque', 'Espèces', 'SP', 'Stock fin'], ['9782748901719', 'Chiens', 8, 10, 1, 1, 2, 0, 6]] });
    const l = lireCarnet(buf, 'carnet.xlsx');
    expect(l.lignes[0]).toMatchObject({ cb: 1, cheque: 1, especes: 2, ventes: 4, stock_debut: 10, stock_fin: 6 });
  });
});
