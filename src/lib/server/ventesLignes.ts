/**
 * Ventes d'un exercice, canal par canal, ligne par ligne — ce qu'on relit, trie,
 * filtre et corrige dans « Ventes par exercice ».
 *
 * Deux natures de lignes :
 *   - les canaux alimentés par les commandes du site (connecteur `orders`) : une
 *     ligne = un livre d'une commande (`contains`), à sa date de paiement ; on ne
 *     la corrige pas ici, on ouvre la commande — seule la note se saisit ;
 *   - les autres (distributeur, tableurs importés, SumUp) : une ligne = une ligne
 *     de relevé (`sales_line`), datée de la période de son relevé ; quantités,
 *     montants et commentaire se corrigent sur place.
 */
import { query, recId } from './surreal';
import { listCanaux, SOUS_CANAUX, type Canal } from './canaux';

const PAYEES = "['completed','paid','processing','sent_to_bl']";
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface LigneVente {
  id: string;
  type: 'order' | 'line';
  date: string;                 // ISO — date de paiement, ou début de période
  periode?: string;             // libellé de la période du relevé
  isbn?: string;
  title?: string;
  book_slug?: string;
  format: string;
  qty: number;                  // net de retours
  montant: number;              // TTC encaissé (commandes), ou HT relevé (relevés)
  montant_nature: 'ttc' | 'ht';
  detail: string;
  note?: string;
  // Champs bruts, pour le formulaire de correction
  order_number?: number;
  units_sold?: number; units_returned?: number; units_free?: number; units_export?: number;
  gross_price?: number; gross_ht?: number; net_receipt?: number;
  report_label?: string;
}

export interface RequeteLignes {
  code: string; annee: number; page?: number; parPage?: number;
  tri?: 'date' | 'isbn' | 'title' | 'qty' | 'montant'; dir?: 'asc' | 'desc';
  q?: string; format?: string;
}

const mois = (d: Date) => d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const jour = (d: Date) => d.toLocaleDateString('fr-FR', { timeZone: 'UTC' });
/** Libellé d'une période de relevé : « mai 2026 » si elle tient dans un mois, sinon les deux dates. */
export function libellePeriode(ps: string, pe: string): string {
  const a = new Date(ps), b = new Date(pe);
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) return mois(a);
  if (a.getUTCMonth() === 0 && a.getUTCDate() === 1 && b.getUTCMonth() === 11 && b.getUTCDate() === 31) return `année ${a.getUTCFullYear()}`;
  return `${jour(a)} → ${jour(b)}`;
}

async function canalDe(code: string): Promise<Canal> {
  const c = (await listCanaux()).find((x) => x.code === code);
  if (!c) throw new Error(`Canal inconnu : ${code}`);
  return c;
}

const bornes = (annee: number) => ({ s: new Date(Date.UTC(annee, 0, 1)), e: new Date(Date.UTC(annee, 11, 31, 23, 59, 59, 999)) });

/** Une page de lignes d'un canal pour un exercice, avec le total du filtre. */
export async function lignesCanal(r: RequeteLignes): Promise<{ rows: LigneVente[]; total: number; totaux: { qty: number; montant: number }; page: number; pages: number }> {
  const canal = await canalDe(r.code);
  const parPage = Math.min(200, Math.max(10, r.parPage ?? 50));
  const page = Math.max(1, r.page ?? 1);
  const dir = r.dir === 'asc' ? 'ASC' : 'DESC';
  const q = (r.q ?? '').trim().toLowerCase();
  const vars: Record<string, unknown> = { annee: r.annee, q, limit: parPage, start: (page - 1) * parPage, ...bornes(r.annee) };

  if (canal.connector === 'orders' && canal.order_channel) {
    vars.oc = canal.order_channel;
    const where = [`in.status IN ${PAYEES}`, 'in.channel = $oc', 'time::year(in.paid_at ?? in.created_at) = $annee'];
    if (q) where.push(`(string::lowercase(out.title ?? title_snapshot ?? '') CONTAINS $q OR (out.isbn_paper ?? '') CONTAINS $q OR <string>in.number CONTAINS $q)`);
    if (r.format) { where.push('format = $format'); vars.format = r.format === 'ebook' ? 'epub' : r.format === 'paper' ? 'papier' : r.format; }
    const w = where.join(' AND ');
    const tri = { date: 'date', isbn: 'isbn', title: 'title', qty: 'qty', montant: 'montant' }[r.tri ?? 'date'] ?? 'date';
    const rows = await query<any>(
      `SELECT meta::id(id) AS id, (in.paid_at ?? in.created_at) AS date, in.number AS order_number, in.customer.full_name AS client, in.email AS email,
              in.payment_method AS paiement, in.notes AS note, in.event.title AS rencontre,
              (out.isbn_paper ?? isbn_snapshot) AS isbn, (out.title ?? title_snapshot) AS title, out.slug AS book_slug,
              format, qty, line_total AS montant, unit_price
         FROM contains WHERE ${w} ORDER BY ${tri} ${dir} LIMIT $limit START $start`, vars);
    const [cnt] = await query<any>(`SELECT count() AS n, math::sum(qty) AS qty, math::sum(line_total) AS montant FROM contains WHERE ${w} GROUP ALL`, vars);
    const total = Number(cnt?.n ?? 0);
    return {
      rows: rows.map((l: any): LigneVente => ({
        id: l.id, type: 'order', date: l.date, isbn: l.isbn ?? undefined, title: l.title, book_slug: l.book_slug,
        format: l.format === 'epub' ? 'ebook' : l.format === 'papier' ? 'paper' : l.format,
        qty: Number(l.qty), montant: r2(Number(l.montant ?? 0)), montant_nature: 'ttc',
        detail: [`n° ${l.order_number}`, l.client ?? l.email ?? 'sans client', PAIEMENT[l.paiement] ?? l.paiement, l.rencontre].filter(Boolean).join(' · '),
        note: l.note ?? undefined, order_number: l.order_number, gross_price: Number(l.unit_price)
      })),
      total, totaux: { qty: Number(cnt?.qty ?? 0), montant: r2(Number(cnt?.montant ?? 0)) }, page, pages: Math.max(1, Math.ceil(total / parPage))
    };
  }

  vars.ch = recId('sales_channel', canal.id);
  const where = ['report.channel = $ch', 'report.period_end >= $s', 'report.period_start <= $e'];
  if (q) where.push(`(string::lowercase(book.title ?? '') CONTAINS $q OR (book.isbn_paper ?? isbn ?? '') CONTAINS $q)`);
  if (r.format) { where.push('format = $format'); vars.format = r.format; }
  const w = where.join(' AND ');
  const tri = { date: 'date', isbn: 'isbn', title: 'title', qty: 'qty', montant: 'montant' }[r.tri ?? 'date'] ?? 'date';
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, report.period_start AS date, report.period_end AS pe, report.label AS report_label,
            (book.isbn_paper ?? isbn) AS isbn, book.title AS title, book.slug AS book_slug, format,
            (units_sold - units_returned) AS qty, (gross_ht ?? ((gross_price ?? 0) * (units_sold - units_returned))) AS montant,
            units_sold, units_returned, units_free, units_export, gross_price, gross_ht, net_receipt, note
       FROM sales_line WHERE ${w} ORDER BY ${tri} ${dir} LIMIT $limit START $start`, vars);
  const [cnt] = await query<any>(
    `SELECT count() AS n, math::sum(units_sold - units_returned) AS qty,
            math::sum(gross_ht ?? ((gross_price ?? 0) * (units_sold - units_returned))) AS montant
       FROM sales_line WHERE ${w} GROUP ALL`, vars);
  const total = Number(cnt?.n ?? 0);
  return {
    rows: rows.map((l: any): LigneVente => ({
      id: l.id, type: 'line', date: l.date, periode: libellePeriode(l.date, l.pe), isbn: l.isbn ?? undefined, title: l.title ?? undefined, book_slug: l.book_slug,
      format: l.format, qty: Number(l.qty ?? 0), montant: r2(Number(l.montant ?? 0)), montant_nature: l.gross_ht != null ? 'ht' : 'ttc',
      detail: [
        l.report_label && l.report_label !== 'auto' ? `relevé « ${l.report_label} »` : 'relevé automatique',
        l.units_returned ? `${l.units_returned} retour${l.units_returned > 1 ? 's' : ''}` : '',
        l.units_free ? `${l.units_free} SP` : '', l.units_export ? `${l.units_export} hors France` : '',
        l.net_receipt != null ? `net facturé ${r2(Number(l.net_receipt))} €` : ''
      ].filter(Boolean).join(' · '),
      note: l.note ?? undefined, report_label: l.report_label ?? undefined,
      units_sold: l.units_sold, units_returned: l.units_returned, units_free: l.units_free, units_export: l.units_export ?? undefined,
      gross_price: l.gross_price ?? undefined, gross_ht: l.gross_ht ?? undefined, net_receipt: l.net_receipt ?? undefined
    })),
    total, totaux: { qty: Number(cnt?.qty ?? 0), montant: r2(Number(cnt?.montant ?? 0)) }, page, pages: Math.max(1, Math.ceil(total / parPage))
  };
}

const PAIEMENT: Record<string, string> = { stripe: 'Stripe', sumup: 'SumUp', especes: 'espèces', cheque: 'chèque', virement: 'virement', autre: 'autre' };

/** Un résumé par canal pour l'exercice : nombre de lignes, exemplaires, montant. */
export async function resumeCanaux(annee: number) {
  const canaux = await listCanaux();
  const b = bornes(annee);
  return Promise.all(canaux.map(async (c) => {
    let n = 0, qty = 0, montant = 0, nature: 'ttc' | 'ht' = 'ttc';
    const sous: { format: string; nom: string; qty: number; montant: number }[] = [];
    if (c.connector === 'orders' && c.order_channel) {
      const parFormat = await query<any>(
        `SELECT format, count() AS n, math::sum(qty) AS qty, math::sum(line_total) AS montant FROM contains
          WHERE in.status IN ${PAYEES} AND in.channel = $oc AND time::year(in.paid_at ?? in.created_at) = $annee GROUP BY format`,
        { oc: c.order_channel, annee });
      for (const r of parFormat) { n += Number(r.n ?? 0); qty += Number(r.qty ?? 0); montant += Number(r.montant ?? 0); }
      montant = r2(montant);
      for (const sc of SOUS_CANAUX[c.code] ?? []) {
        const lignes = parFormat.filter((r: any) => (r.format === 'epub' ? 'ebook' : 'paper') === sc.format);
        sous.push({ format: sc.format, nom: sc.nom, qty: lignes.reduce((a: number, r: any) => a + Number(r.qty ?? 0), 0), montant: r2(lignes.reduce((a: number, r: any) => a + Number(r.montant ?? 0), 0)) });
      }
    } else {
      const [r] = await query<any>(
        `SELECT count() AS n, math::sum(units_sold - units_returned) AS qty,
                math::sum(gross_ht ?? ((gross_price ?? 0) * (units_sold - units_returned))) AS montant,
                count(gross_ht != NONE) AS ht
           FROM sales_line WHERE report.channel = $ch AND report.period_end >= $s AND report.period_start <= $e GROUP ALL`,
        { ch: recId('sales_channel', c.id), ...b });
      n = Number(r?.n ?? 0); qty = Number(r?.qty ?? 0); montant = r2(Number(r?.montant ?? 0)); nature = Number(r?.ht ?? 0) > 0 ? 'ht' : 'ttc';
    }
    return { code: c.code, name: c.name, color: c.color, family: c.family, connector: c.connector, mode: c.mode, enabled: c.enabled, lignes: n, qty, montant, nature, sous, editable: c.connector !== 'orders' };
  })).then((l) => l.filter((c) => c.enabled || c.lignes > 0)); // un canal caché se montre quand même s'il a vendu
}

/** Correction d'une ligne de relevé ; l'ISBN modifié fait retrouver le livre. */
export async function modifierLigne(id: string, c: Partial<{ units_sold: number; units_returned: number; units_free: number; units_export: number | null; gross_price: number | null; gross_ht: number | null; net_receipt: number | null; isbn: string; note: string | null }>) {
  const set: Record<string, unknown> = { updated_at: new Date() };
  const entier = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
  const nombreOuNone = (v: unknown) => (v == null || v === '' ? undefined : Number(v));
  if (c.units_sold != null) set.units_sold = entier(c.units_sold);
  if (c.units_returned != null) set.units_returned = entier(c.units_returned);
  if (c.units_free != null) set.units_free = entier(c.units_free);
  if ('units_export' in c) set.units_export = c.units_export == null ? undefined : entier(c.units_export);
  if ('gross_price' in c) set.gross_price = nombreOuNone(c.gross_price);
  if ('gross_ht' in c) set.gross_ht = nombreOuNone(c.gross_ht);
  if ('net_receipt' in c) set.net_receipt = nombreOuNone(c.net_receipt);
  if ('note' in c) set.note = c.note?.trim() || undefined;
  if (c.isbn != null) {
    const isbn = c.isbn.replace(/\D/g, '');
    set.isbn = isbn || undefined;
    const b = await query<any>(`SELECT id FROM book WHERE isbn_paper = $i OR isbn_ebook = $i LIMIT 1`, { i: isbn });
    set.book = b[0] ? recId('book', String(b[0].id).replace(/^book:/, '')) : undefined;
  }
  await query(`UPDATE $id MERGE $set`, { id: recId('sales_line', id), set });
}

/** Sur une ligne de commande, seule la note (celle de la commande) se saisit ici. */
export async function modifierNoteCommande(numero: number, note: string | null) {
  await query(`UPDATE order SET notes = $n WHERE number = $num`, { n: note?.trim() || undefined, num: numero });
}
