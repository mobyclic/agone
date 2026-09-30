/**
 * Import d'un relevé de ventes depuis un tableur (xlsx, xls, csv).
 *
 * En deux temps : on LIT le fichier et on propose une correspondance des
 * colonnes (par les intitulés) ; l'opérateur corrige et valide ; alors seulement
 * on crée le relevé. Entre les deux, le fichier lu attend en mémoire sous un
 * jeton — trente minutes, puis il est oublié.
 */
import * as XLSX from 'xlsx';

export type Champ = 'isbn' | 'units_sold' | 'units_returned' | 'gross_price' | 'gross_ht' | 'net_receipt' | 'format' | 'title' | 'ignore';

export const CHAMPS: { key: Champ; nom: string; requis?: boolean; aide: string }[] = [
  { key: 'isbn', nom: 'ISBN / EAN', requis: true, aide: 'Le livre est retrouvé par son ISBN (papier ou numérique).' },
  { key: 'units_sold', nom: 'Exemplaires vendus', requis: true, aide: 'Quantité vendue sur la période.' },
  { key: 'units_returned', nom: 'Retours', aide: 'Exemplaires retournés (en positif).' },
  { key: 'gross_price', nom: 'Prix unitaire', aide: 'Prix de vente unitaire TTC (canaux directs).' },
  { key: 'gross_ht', nom: 'Montant HT', aide: 'Chiffre au prix public HT sur la ligne (distributeurs).' },
  { key: 'net_receipt', nom: 'Net facturé', aide: 'Montant réellement facturé, après remise.' },
  { key: 'format', nom: 'Format', aide: 'papier / numérique ; sinon le format est fixé pour tout le fichier.' },
  { key: 'title', nom: 'Titre (information)', aide: 'Non enregistré : sert à relire.' },
  { key: 'ignore', nom: '— ignorer —', aide: '' }
];

export interface Lecture {
  token: string;
  nomFichier: string;
  feuilles: string[];
  feuille: string;
  entetes: string[];
  lignes: (string | number | null)[][];   // toutes les lignes de données
  apercu: (string | number | null)[][];   // les cinq premières
  proposition: Record<number, Champ>;      // index de colonne → champ
  expire: number;
}

const attente = new Map<string, Lecture>();
const TTL = 30 * 60_000;

/** Devine le champ d'après l'intitulé de colonne. */
export function devinerChamp(entete: string): Champ {
  const h = entete.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/isbn|ean|gencod|code[- _]?article/.test(h)) return 'isbn';
  if (/retour|return|rendu/.test(h)) return 'units_returned';
  if (/net factur|facture|net receipt|net ht|encaiss/.test(h)) return 'net_receipt';
  // « P.U. HT » est un prix unitaire, pas un montant : le prix se teste avant le HT.
  if (/prix|price|\bpu\b|p\.u|tarif|unitaire/.test(h)) return 'gross_price';
  if (/montant|ca ht|chiffre|ht\b|total/.test(h)) return 'gross_ht';
  if (/vend|vente|sold|units|qte|qt[ée]|quantit|nb|exempl/.test(h)) return 'units_sold';
  if (/format|support|type/.test(h)) return 'format';
  if (/titre|title|ouvrage|libell/.test(h)) return 'title';
  return 'ignore';
}

export function lireTableur(buffer: Buffer, nomFichier: string, feuilleVoulue?: string): Lecture {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const feuilles = wb.SheetNames;
  const feuille = feuilleVoulue && feuilles.includes(feuilleVoulue) ? feuilleVoulue : feuilles[0];
  const ws = wb.Sheets[feuille];
  const brut: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
  // La ligne d'en-tête est la première qui compte au moins deux cellules textuelles.
  let iEntete = brut.findIndex((r) => r.filter((c) => typeof c === 'string' && c.trim()).length >= 2);
  if (iEntete < 0) iEntete = 0;
  const entetes = (brut[iEntete] ?? []).map((c, i) => (c == null || c === '' ? `Colonne ${i + 1}` : String(c).trim()));
  const lignes = brut.slice(iEntete + 1).filter((r) => r.some((c) => c != null && c !== ''));
  const proposition: Record<number, Champ> = {};
  const pris = new Set<Champ>();
  entetes.forEach((e, i) => {
    const c = devinerChamp(e);
    if (c !== 'ignore' && !pris.has(c)) { proposition[i] = c; pris.add(c); }
  });
  // Nettoyage des lectures périmées, puis dépôt de celle-ci.
  const maintenant = Date.now();
  for (const [k, v] of attente) if (v.expire < maintenant) attente.delete(k);
  const lecture: Lecture = {
    token: Math.random().toString(36).slice(2, 12) + maintenant.toString(36),
    nomFichier, feuilles, feuille, entetes, lignes, apercu: lignes.slice(0, 5), proposition, expire: maintenant + TTL
  };
  attente.set(lecture.token, lecture);
  return lecture;
}

export const lectureEnAttente = (token: string): Lecture | null => {
  const l = attente.get(token);
  return l && l.expire > Date.now() ? l : null;
};

const nombre = (v: unknown): number => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/\s| /g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const formatDe = (v: unknown, defaut: string) => {
  const s = String(v ?? '').toLowerCase();
  if (/epub|num|ebook|digital|pdf/.test(s)) return 'ebook';
  if (/pap|print|broch|reli/.test(s)) return 'paper';
  return defaut;
};

/** Applique la correspondance validée : rend les lignes prêtes pour addSalesLines. */
export function appliquerCorrespondance(
  lecture: Lecture, mapping: Record<number, Champ>, formatDefaut: 'paper' | 'ebook'
) {
  const col = (champ: Champ) => Number(Object.entries(mapping).find(([, c]) => c === champ)?.[0] ?? -1);
  const iIsbn = col('isbn'), iVendus = col('units_sold'), iRetours = col('units_returned'),
    iPrix = col('gross_price'), iHt = col('gross_ht'), iNet = col('net_receipt'), iFormat = col('format');
  const lignes: { isbn: string; format: string; units_sold: number; units_returned: number; gross_price?: number; gross_ht?: number; net_receipt?: number }[] = [];
  let sansIsbn = 0;
  for (const r of lecture.lignes) {
    const isbn = String(r[iIsbn] ?? '').replace(/\D/g, '');
    if (isbn.length < 10) { sansIsbn++; continue; }
    // Un retour saisi en négatif dans le tableur vaut un retour positif chez nous.
    const retours = Math.abs(nombre(iRetours >= 0 ? r[iRetours] : 0));
    lignes.push({
      isbn, format: iFormat >= 0 ? formatDe(r[iFormat], formatDefaut) : formatDefaut,
      units_sold: nombre(r[iVendus]), units_returned: retours,
      gross_price: iPrix >= 0 ? nombre(r[iPrix]) || undefined : undefined,
      gross_ht: iHt >= 0 ? nombre(r[iHt]) || undefined : undefined,
      net_receipt: iNet >= 0 ? nombre(r[iNet]) || undefined : undefined
    });
  }
  return { lignes, sansIsbn };
}
