/**
 * Lecture d'un carnet de vente (tableur rempli par un dépositaire).
 *
 * La ligne d'en-tête est celle qui contient « ISBN » ; les colonnes se
 * reconnaissent à leur intitulé — le gabarit d'Agone comme les classeurs des
 * salonneurs (CB, Chek/Chèque, Liquid/Espèces, SP, Stock ×2). Le fichier lu
 * attend en mémoire sous un jeton (trente minutes) entre l'aperçu et la
 * validation. Module sans accès à la base : testable tel quel.
 */
import * as XLSX from 'xlsx';

/**
 * Certaines feuilles .xls déclarent une plage immense (jusqu'à la ligne 65 536
 * et la colonne IV) : `sheet_to_json` parcourt alors des millions de cellules
 * vides et ne rend jamais la main. On resserre la plage sur les cellules
 * réellement présentes avant de lire.
 */
export function resserrerPlage(ws: XLSX.WorkSheet, maxLignes = 20000): void {
  let r0 = Infinity, c0 = Infinity, r1 = -1, c1 = -1;
  for (const k of Object.keys(ws)) {
    if (k[0] === '!') continue;
    const a = XLSX.utils.decode_cell(k);
    if (a.r < r0) r0 = a.r; if (a.r > r1) r1 = a.r; if (a.c < c0) c0 = a.c; if (a.c > c1) c1 = a.c;
  }
  if (r1 < 0) { ws['!ref'] = 'A1:A1'; return; }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: r0, c: c0 }, e: { r: Math.min(r1, r0 + maxLignes), c: c1 } });
}

export interface LigneCarnet {
  isbn: string; titre: string; prix?: number; stock_debut?: number; cb: number; cheque: number; especes: number; ventes: number; sp: number; stock_fin?: number;
}
export interface LectureCarnet {
  token: string; nomFichier: string; feuilles: string[]; feuille: string; lignes: LigneCarnet[]; expire: number;
  buffer: Buffer;
}

const attente = new Map<string, LectureCarnet>();
const TTL = 30 * 60_000;
export const lectureCarnet = (token: string): LectureCarnet | null => {
  const l = attente.get(token);
  return l && l.expire > Date.now() ? l : null;
};

const nombre = (v: unknown): number => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/[€\s]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const estVide = (v: unknown) => v == null || String(v).trim() === '';

/**
 * Lit un carnet : la ligne d'en-tête est celle qui contient « ISBN » ; les
 * colonnes se reconnaissent à leur intitulé (le gabarit d'Agone comme les
 * classeurs des salonneurs : CB, Chek/Chèque, Liquid/Espèces, SP, Stock ×2).
 */
export function lireCarnet(buffer: Buffer, nomFichier: string, feuilleVoulue?: string): LectureCarnet {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const feuilles = wb.SheetNames;
  const feuille = feuilleVoulue && feuilles.includes(feuilleVoulue) ? feuilleVoulue : (feuilles.find((f) => /carnet|vente/i.test(f)) ?? feuilles[0]);
  const ws = wb.Sheets[feuille];
  resserrerPlage(ws);
  const brut: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
  const iEntete = brut.findIndex((r) => r.some((c) => typeof c === 'string' && /isbn|ean/i.test(c)));
  const lignes: LigneCarnet[] = [];
  if (iEntete >= 0) {
    const ent = brut[iEntete].map((c) => String(c ?? '').toLowerCase().trim());
    const col = (re: RegExp, from = 0) => { const i = ent.findIndex((e, k) => k >= from && re.test(e)); return i < 0 ? -1 : i; };
    const cIsbn = col(/isbn|ean/), cTitre = col(/titre|title/), cPrix = col(/prix|pp|price|tarif/);
    const cStock1 = col(/^stock/), cStock2 = cStock1 >= 0 ? col(/^stock/, cStock1 + 1) : -1;
    const cCb = col(/^cb|carte/), cCheque = col(/ch[eè]que|chek|chq/), cEspeces = col(/liquid|esp[eè]ce|cash/);
    const cVentes = col(/^vente|vendu|qt[ée]|quantit/), cSp = col(/^sp$|service|presse|offert|gratuit/);
    const cCa = col(/^ca\b|chiffre|total/);
    for (const r of brut.slice(iEntete + 1)) {
      const isbn = String(r[cIsbn] ?? '').replace(/\D/g, '');
      if (isbn.length < 10) continue;
      const cb = cCb >= 0 ? nombre(r[cCb]) : 0, cheque = cCheque >= 0 ? nombre(r[cCheque]) : 0, especes = cEspeces >= 0 ? nombre(r[cEspeces]) : 0;
      const ventesCol = cVentes >= 0 && cVentes !== cCa && !estVide(r[cVentes]) ? nombre(r[cVentes]) : null;
      lignes.push({
        isbn, titre: cTitre >= 0 ? String(r[cTitre] ?? '').trim() : '',
        prix: cPrix >= 0 && !estVide(r[cPrix]) ? nombre(r[cPrix]) : undefined,
        stock_debut: cStock1 >= 0 && !estVide(r[cStock1]) ? Math.round(nombre(r[cStock1])) : undefined,
        cb: Math.round(cb), cheque: Math.round(cheque), especes: Math.round(especes),
        ventes: Math.round(ventesCol ?? cb + cheque + especes),
        sp: cSp >= 0 ? Math.round(nombre(r[cSp])) : 0,
        stock_fin: cStock2 >= 0 && !estVide(r[cStock2]) ? Math.round(nombre(r[cStock2])) : undefined
      });
    }
  }
  const maintenant = Date.now();
  for (const [k, v] of attente) if (v.expire < maintenant) attente.delete(k);
  const lecture: LectureCarnet = {
    token: Math.random().toString(36).slice(2, 12) + maintenant.toString(36), nomFichier, feuilles, feuille, lignes, expire: maintenant + TTL, buffer
  };
  attente.set(lecture.token, lecture);
  return lecture;
}

/** Relecture d'un fichier déjà reçu sur une autre feuille. */
export function relireCarnet(token: string, feuille: string): LectureCarnet | null {
  const l = lectureCarnet(token);
  if (!l) return null;
  attente.delete(token);
  return lireCarnet(l.buffer, l.nomFichier, feuille);
}


export const oublierLecture = (token: string) => { attente.delete(token); };
