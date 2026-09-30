/**
 * Import de commandes depuis un tableur (ventes en rencontre, carnet de comptoir,
 * relevé d'un salon…). Même mécanique que l'import d'un relevé : on lit, on
 * fait correspondre les colonnes, on valide. Chaque ligne est un livre vendu ;
 * les lignes qui partagent une référence (ou, à défaut, une date et un client)
 * forment une commande. Le type, le mode de paiement et la rencontre valent
 * pour tout le fichier, sauf colonne dédiée.
 */
import { query } from './surreal';
import { nombre, type Lecture } from './importTableur';
import { createAdminOrder, type AdminOrderLine } from './order';
import { heureParisVersDate } from '$lib/dates';

export type ChampCommande = 'ref' | 'date' | 'isbn' | 'title' | 'qty' | 'unit_price' | 'format' | 'email' | 'first_name' | 'last_name' | 'payment' | 'ignore';

export const CHAMPS_COMMANDES: { key: ChampCommande; nom: string; requis?: boolean; aide: string }[] = [
  { key: 'isbn', nom: 'ISBN / EAN', requis: true, aide: 'Le livre est retrouvé par son ISBN ; sinon par le titre exact.' },
  { key: 'title', nom: 'Titre', aide: 'Sert à retrouver le livre si l’ISBN manque.' },
  { key: 'qty', nom: 'Quantité', aide: 'Vide = 1.' },
  { key: 'unit_price', nom: 'Prix unitaire TTC', aide: 'Vide = prix du catalogue ; 0 = offert.' },
  { key: 'date', nom: 'Date', aide: 'Date de la vente (commande antidatée) ; vide = date choisie ci-dessous.' },
  { key: 'ref', nom: 'Référence', aide: 'Les lignes de même référence font une seule commande.' },
  { key: 'email', nom: 'Email client', aide: 'Crée ou retrouve le compte client ; vide = vente sans client.' },
  { key: 'first_name', nom: 'Prénom', aide: '' },
  { key: 'last_name', nom: 'Nom', aide: '' },
  { key: 'payment', nom: 'Mode de paiement', aide: 'sumup / espèces / chèque / virement ; vide = celui choisi ci-dessous.' },
  { key: 'format', nom: 'Format', aide: 'papier / numérique ; vide = papier.' },
  { key: 'ignore', nom: '— ignorer —', aide: '' }
];

export function devinerChampCommande(entete: string): ChampCommande {
  const h = entete.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/isbn|ean|gencod/.test(h)) return 'isbn';
  if (/e-?mail|courriel/.test(h)) return 'email';
  if (/prenom|first/.test(h)) return 'first_name';
  if (/\bnom\b|last|client/.test(h)) return 'last_name';
  if (/paiement|payment|reglement|mode/.test(h)) return 'payment';
  if (/date|jour/.test(h)) return 'date';
  if (/ref|n°|numero|commande|ticket/.test(h)) return 'ref';
  if (/prix|price|\bpu\b|p\.u|tarif|unitaire|montant/.test(h)) return 'unit_price';
  if (/qte|qt[ée]|quantit|nb|exempl|vend/.test(h)) return 'qty';
  if (/format|support/.test(h)) return 'format';
  if (/titre|title|ouvrage|livre/.test(h)) return 'title';
  return 'ignore';
}

const paiementDe = (v: unknown, defaut: string) => {
  const s = String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/sumup|cb|carte|card/.test(s)) return 'sumup';
  if (/esp|cash|liquide/.test(s)) return 'especes';
  if (/chq|cheque|check/.test(s)) return 'cheque';
  if (/vir|transfer/.test(s)) return 'virement';
  if (/stripe/.test(s)) return 'stripe';
  return s ? 'autre' : defaut;
};

/** Date d'une cellule : nombre Excel (jours depuis 1899-12-30), ISO, ou jj/mm/aaaa. */
export function dateDe(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400000));
  const s = String(v).trim();
  const fr = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (fr) { const a = fr[3].length === 2 ? 2000 + Number(fr[3]) : Number(fr[3]); return heureParisVersDate(`${a}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}T12:00`); }
  const isoM = s.match(/^\d{4}-\d{2}-\d{2}/);
  if (isoM) return heureParisVersDate(`${isoM[0]}T12:00`);
  const d = new Date(s);
  return isNaN(+d) ? null : d;
}

export interface OptionsImport {
  channel: string; status: string; paymentMethod: string; eventId?: string; placedAt: Date; silencieux: boolean;
}
export interface CommandeAImporter {
  cle: string; date: Date; email?: string; first_name?: string; last_name?: string; payment: string;
  lines: AdminOrderLine[]; inconnus: string[];
}

/** Regroupe les lignes du tableur en commandes, livres résolus par ISBN ou titre. */
export async function construireCommandes(lecture: Lecture, mapping: Record<number, ChampCommande>, o: OptionsImport): Promise<{ commandes: CommandeAImporter[]; ignorees: number }> {
  const col = (c: ChampCommande) => Number(Object.entries(mapping).find(([, v]) => v === c)?.[0] ?? -1);
  const i = Object.fromEntries((['ref', 'date', 'isbn', 'title', 'qty', 'unit_price', 'format', 'email', 'first_name', 'last_name', 'payment'] as ChampCommande[]).map((c) => [c, col(c)])) as Record<ChampCommande, number>;
  const cell = (r: any[], c: ChampCommande) => (i[c] >= 0 ? r[i[c]] : null);

  const livres = await query<any>(`SELECT id, title, isbn_paper, isbn_ebook, price_paper, price_ebook FROM book`);
  const parIsbn = new Map<string, any>(), parTitre = new Map<string, any>();
  for (const b of livres) {
    if (b.isbn_paper) parIsbn.set(String(b.isbn_paper).replace(/\D/g, ''), b);
    if (b.isbn_ebook) parIsbn.set(String(b.isbn_ebook).replace(/\D/g, ''), b);
    parTitre.set(String(b.title).toLowerCase().trim(), b);
  }

  const commandes = new Map<string, CommandeAImporter>();
  let ignorees = 0;
  lecture.lignes.forEach((r, n) => {
    const isbn = String(cell(r, 'isbn') ?? '').replace(/\D/g, '');
    const titre = String(cell(r, 'title') ?? '').toLowerCase().trim();
    const livre = (isbn && parIsbn.get(isbn)) || (titre && parTitre.get(titre));
    const email = String(cell(r, 'email') ?? '').trim().toLowerCase() || undefined;
    const date = dateDe(cell(r, 'date')) ?? o.placedAt;
    const ref = String(cell(r, 'ref') ?? '').trim();
    // Même référence = même commande ; sinon une commande par ligne, ou par client et par jour.
    const cle = ref || (email ? `${email}|${date.toISOString().slice(0, 10)}` : `ligne-${n}`);
    const c = commandes.get(cle) ?? {
      cle, date, email, first_name: String(cell(r, 'first_name') ?? '').trim() || undefined, last_name: String(cell(r, 'last_name') ?? '').trim() || undefined,
      payment: paiementDe(cell(r, 'payment'), o.paymentMethod), lines: [], inconnus: []
    };
    if (!livre) { c.inconnus.push(isbn || titre || `ligne ${n + 1}`); ignorees++; commandes.set(cle, c); return; }
    const format = /num|epub|ebook/i.test(String(cell(r, 'format') ?? '')) ? 'epub' : 'papier';
    const prixCell = cell(r, 'unit_price');
    const prix = prixCell == null || prixCell === '' ? Number(format === 'epub' ? livre.price_ebook ?? livre.price_paper : livre.price_paper) || 0 : nombre(prixCell);
    const qty = Math.max(1, Math.round(nombre(cell(r, 'qty')) || 1));
    c.lines.push({ bookId: String(livre.id).replace(/^book:/, ''), title: livre.title, format, qty, unit_price: prix });
    commandes.set(cle, c);
  });
  return { commandes: [...commandes.values()].filter((c) => c.lines.length), ignorees };
}

/** Crée les commandes ; renvoie les numéros. */
export async function importerCommandes(commandes: CommandeAImporter[], o: OptionsImport): Promise<number[]> {
  const numeros: number[] = [];
  for (const c of commandes) {
    const { number } = await createAdminOrder({
      newCustomer: c.email ? { email: c.email, first_name: c.first_name, last_name: c.last_name } : undefined,
      channel: o.channel, status: o.status, paymentMethod: c.payment, eventId: o.eventId, placedAt: c.date,
      silencieux: o.silencieux, lines: c.lines
    });
    numeros.push(number);
  }
  return numeros;
}
