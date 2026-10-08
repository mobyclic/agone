/**
 * Dépôts : exemplaires confiés à des dépositaires (salonneurs, associations,
 * librairies amies) qui les vendent pour Agone.
 *
 * Le stock d'un dépôt est la somme de ses mouvements (depot_movement) :
 *   inventaire (écart constaté au comptage), reassort (+), vente (−),
 *   sp (− service de presse, hors droits), retour (− renvoyé), ecart (± carnet).
 *
 * Un carnet de vente (le tableur que remplit le dépositaire : ISBN, titre, prix,
 * stock début, CB, chèque, espèces, SP, stock fin) s'importe en deux temps —
 * lecture et aperçu, puis validation — et crée EN UNE FOIS :
 *   1. le relevé de ventes sur le canal « depots » (lignes par titre, SP en
 *      exemplaires gratuits, net = prix public HT moins la remise) ;
 *   2. le brouillon de facture au dépositaire (prix public TTC moins la remise) ;
 *   3. les mouvements du dépôt (ventes, SP, et l'écart si le stock fin compté
 *      ne tombe pas juste).
 */
import * as XLSX from 'xlsx';
import { query, recId } from './surreal';
import { lireCarnet, relireCarnet, lectureCarnet, oublierLecture, type LigneCarnet, type LectureCarnet } from './carnetLecture';
export { lireCarnet, relireCarnet, lectureCarnet, type LigneCarnet, type LectureCarnet };
import { getSetting } from './site';
import { getClientPro, type ClientPro } from './clients';
import { getCanal } from './canaux';
import { createManualInvoice } from './invoice';

// ── Réglages ─────────────────────────────────────────────────

export async function remiseDepotDefaut(): Promise<number> {
  const v = ((await getSetting('depots')) ?? {}) as Record<string, unknown>;
  const n = Number(v.remise);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 30;
}

/** Remise effective d'un dépositaire : la sienne, sinon celle des paramètres. */
export async function remisePour(client: ClientPro): Promise<number> {
  return client.remise_depot != null ? client.remise_depot : await remiseDepotDefaut();
}

// ── Dépôts et stock ───────────────────────────────────────────

export interface Depositaire extends ClientPro {
  stock_total: number;
  titres: number;
  dernier_carnet?: string;
  remise_effective: number;
}

export async function listDepositaires(): Promise<Depositaire[]> {
  const clients = await query<any>(`SELECT meta::id(id) AS id, name FROM client WHERE depositaire = true ORDER BY name ASC`);
  const defaut = await remiseDepotDefaut();
  const out: Depositaire[] = [];
  for (const row of clients) {
    const c = await getClientPro(String(row.id));
    if (!c) continue;
    const cid = recId('client', c.id);
    const [stock, carnet] = await Promise.all([
      query<any>(`SELECT book, math::sum(qty) AS q FROM depot_movement WHERE client = $c GROUP BY book`, { c: cid }),
      query<any>(`SELECT sold_at FROM carnet WHERE client = $c AND status = 'validated' ORDER BY sold_at DESC LIMIT 1`, { c: cid })
    ]);
    const positifs = stock.filter((s: any) => Number(s.q) > 0);
    out.push({
      ...c,
      stock_total: positifs.reduce((n: number, s: any) => n + Number(s.q), 0),
      titres: positifs.length,
      dernier_carnet: carnet[0]?.sold_at ?? undefined,
      remise_effective: c.remise_depot != null ? c.remise_depot : defaut
    });
  }
  return out;
}

export interface LigneStock {
  book_id: string; title: string; isbn?: string; price_paper?: number; collection?: string; slug?: string; qty: number;
}

/** Stock du dépôt titre par titre (tous les titres ayant eu un mouvement, même revenus à zéro). */
export async function stockDepot(clientId: string): Promise<LigneStock[]> {
  // Somme par livre d'abord (un GROUP BY ne rend pas proprement les champs non agrégés), détail des livres ensuite.
  const sommes = await stockParLivre(clientId);
  if (!sommes.size) return [];
  const livres = await query<any>(
    `SELECT meta::id(id) AS id, title, isbn_paper AS isbn, price_paper, slug, primary_collection.name AS collection FROM book WHERE id IN $ids`,
    { ids: [...sommes.keys()].map((id) => recId('book', id)) }
  );
  return livres
    .map((r: any) => ({
      book_id: String(r.id), title: r.title ?? '(titre inconnu)', isbn: r.isbn ?? undefined,
      price_paper: r.price_paper != null ? Number(r.price_paper) : undefined, collection: typeof r.collection === 'string' ? r.collection : undefined, slug: r.slug ?? undefined,
      qty: sommes.get(String(r.id)) ?? 0
    }))
    .sort((a: LigneStock, b: LigneStock) => (a.collection ?? '').localeCompare(b.collection ?? '', 'fr') || a.title.localeCompare(b.title, 'fr'));
}

export interface Mouvement {
  id: string; kind: string; qty: number; at: string; note?: string; title: string; book_id: string; carnet_label?: string;
}

export const KIND_MOUVEMENT: Record<string, string> = {
  inventaire: 'Inventaire', reassort: 'Réassort', vente: 'Vente', sp: 'Service de presse', retour: 'Retour', ecart: 'Écart'
};

export async function mouvementsDepot(clientId: string, limit = 60): Promise<Mouvement[]> {
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, kind, qty, at, created_at, note, book, book.title AS title, carnet.label AS carnet_label
       FROM depot_movement WHERE client = $c ORDER BY at DESC, created_at DESC LIMIT $l`,
    { c: recId('client', clientId), l: limit }
  );
  return rows.map((r: any) => ({
    id: String(r.id), kind: r.kind, qty: Number(r.qty), at: r.at, note: r.note ?? undefined, title: r.title ?? '(titre inconnu)',
    book_id: String(r.book).replace(/^book:/, ''), carnet_label: r.carnet_label ?? undefined
  }));
}

async function stockParLivre(clientId: string): Promise<Map<string, number>> {
  const rows = await query<any>(`SELECT book, math::sum(qty) AS q FROM depot_movement WHERE client = $c GROUP BY book`, { c: recId('client', clientId) });
  return new Map(rows.map((r: any) => [String(r.book).replace(/^book:/, ''), Number(r.q ?? 0)]));
}

/**
 * Inventaire : pour chaque titre compté, l'écart avec le stock attendu devient un
 * mouvement « inventaire ». Les titres non comptés ne bougent pas. Le premier
 * inventaire d'un dépôt pose son stock initial.
 */
export async function poserInventaire(clientId: string, comptes: { bookId: string; compte: number }[], opts: { at?: Date; note?: string } = {}) {
  const actuel = await stockParLivre(clientId);
  const at = opts.at ?? new Date();
  let ajustes = 0, ecart = 0;
  for (const c of comptes) {
    const attendu = actuel.get(c.bookId) ?? 0;
    const diff = Math.round(c.compte) - attendu;
    if (!diff) continue;
    await query(`CREATE depot_movement CONTENT $m`, {
      m: { client: recId('client', clientId), book: recId('book', c.bookId), kind: 'inventaire', qty: diff, at,
           note: [`compté ${Math.round(c.compte)}, attendu ${attendu}`, opts.note?.trim()].filter(Boolean).join(' — ') }
    });
    ajustes++; ecart += diff;
  }
  return { ajustes, ecart };
}

/** Réassort : des exemplaires entrent au dépôt (depuis Belles Lettres ou le bureau). */
export async function poserReassort(clientId: string, lignes: { bookId: string; qty: number }[], opts: { at?: Date; note?: string } = {}) {
  const at = opts.at ?? new Date();
  let n = 0;
  for (const l of lignes) {
    const qty = Math.round(l.qty);
    if (!qty) continue;
    await query(`CREATE depot_movement CONTENT $m`, {
      m: { client: recId('client', clientId), book: recId('book', l.bookId), kind: qty > 0 ? 'reassort' : 'retour', qty, at, note: opts.note?.trim() || undefined }
    });
    n++;
  }
  return n;
}

// ── Carnets de vente : lecture → ./carnetLecture.ts ──────────

// ── Carnets de vente : aperçu et validation ───────────────────

export interface LigneApercu extends LigneCarnet {
  book_id?: string; titre_catalogue?: string; prix_catalogue?: number; vat_rate: number;
  prix_retenu: number; stock_actuel: number; stock_attendu_fin: number; ecart_debut?: number; ecart_fin?: number;
  net_unitaire: number;
}
export interface Apercu {
  lignes: LigneApercu[];
  inconnus: number; ventes: number; sp: number; ca_ttc: number; net_ttc: number; ecarts: number;
  remise: number;
  alignerDebut: boolean;
  /** Titres dont le stock début du carnet diffère du stock connu. */
  ecartsDebut: number;
}

/**
 * Aperçu d'un carnet. Avec `alignerDebut`, le stock début noté sur le carnet
 * fait foi : l'écart avec le stock connu d'AGONE sera posé en inventaire avant
 * les ventes (premier carnet d'un dépôt, ou dépôt jamais inventorié).
 */
export async function apercuCarnet(clientId: string, lecture: LectureCarnet, remise: number, alignerDebut = false): Promise<Apercu> {
  const livres = await query<any>(`SELECT meta::id(id) AS id, title, isbn_paper, price_paper, vat_rate FROM book WHERE isbn_paper != NONE`);
  const parIsbn = new Map<string, any>(livres.map((b: any) => [String(b.isbn_paper).replace(/\D/g, ''), b]));
  const stock = await stockParLivre(clientId);
  const lignes: LigneApercu[] = lecture.lignes.map((l) => {
    const b = parIsbn.get(l.isbn);
    const prix = l.prix ?? (b?.price_paper != null ? Number(b.price_paper) : 0);
    const actuel = b ? (stock.get(String(b.id)) ?? 0) : 0;
    const base = alignerDebut && l.stock_debut != null ? l.stock_debut : actuel;
    const attendu = base - l.ventes - l.sp;
    return {
      ...l, book_id: b ? String(b.id) : undefined, titre_catalogue: b?.title, prix_catalogue: b?.price_paper != null ? Number(b.price_paper) : undefined,
      vat_rate: b?.vat_rate != null ? Number(b.vat_rate) : 5.5, prix_retenu: prix, stock_actuel: actuel, stock_attendu_fin: attendu,
      ecart_debut: b && l.stock_debut != null ? l.stock_debut - actuel : undefined,
      ecart_fin: b && l.stock_fin != null ? l.stock_fin - attendu : undefined,
      net_unitaire: Math.round(prix * (1 - remise / 100) * 100) / 100
    };
  });
  const utiles = lignes.filter((l) => l.ventes || l.sp);
  return {
    lignes, remise, alignerDebut,
    inconnus: lignes.filter((l) => !l.book_id && (l.ventes || l.sp)).length,
    ventes: utiles.reduce((n, l) => n + l.ventes, 0), sp: utiles.reduce((n, l) => n + l.sp, 0),
    ca_ttc: Math.round(utiles.reduce((n, l) => n + l.ventes * l.prix_retenu, 0) * 100) / 100,
    net_ttc: Math.round(utiles.reduce((n, l) => n + l.ventes * l.net_unitaire, 0) * 100) / 100,
    ecarts: lignes.filter((l) => l.book_id && l.ecart_fin).length,
    ecartsDebut: lignes.filter((l) => l.book_id && l.ecart_debut).length
  };
}

export async function validerCarnet(
  clientId: string, lecture: LectureCarnet, opts: { label: string; sold_at: Date; remise: number; sourceMediaId?: string; alignerDebut?: boolean }
): Promise<{ carnetId: string; invoiceId?: string; reportId?: string; ventes: number; sp: number; ecarts: number }> {
  const client = await getClientPro(clientId);
  if (!client) throw new Error('Dépositaire introuvable.');
  const apercu = await apercuCarnet(clientId, lecture, opts.remise, opts.alignerDebut === true);
  const lignes = apercu.lignes.filter((l) => l.book_id && (l.ventes || l.sp || l.ecart_fin || (opts.alignerDebut && l.ecart_debut)));
  if (!lignes.length) throw new Error('Aucune ligne exploitable : pas de vente, de SP ni d’écart sur un titre connu.');
  const canal = await getCanal('depots');
  if (!canal) throw new Error('Canal « Dépôts & salons » absent : ouvrez Canaux de vente pour le recréer.');
  const cid = recId('client', clientId);
  const jour = new Date(opts.sold_at); jour.setHours(0, 0, 0, 0);
  const finJour = new Date(jour); finJour.setHours(23, 59, 59, 0);

  // 1. Le carnet lui-même (trace de ce qui a été importé).
  const carnetRows = await query<any>(`CREATE carnet CONTENT $c`, {
    c: {
      client: cid, label: opts.label.trim() || 'Carnet de vente', sold_at: opts.sold_at, status: 'validated', remise: opts.remise,
      source_file: opts.sourceMediaId ? recId('media', opts.sourceMediaId) : undefined,
      lines: lignes.map((l) => ({ isbn: l.isbn, book: l.book_id, titre: l.titre_catalogue ?? l.titre, prix: l.prix_retenu, cb: l.cb, cheque: l.cheque, especes: l.especes, ventes: l.ventes, sp: l.sp, stock_debut: l.stock_debut ?? null, stock_fin: l.stock_fin ?? null, ecart_fin: l.ecart_fin ?? 0 })),
      totals: { ventes: apercu.ventes, sp: apercu.sp, ca_ttc: apercu.ca_ttc, net_ttc: apercu.net_ttc }
    }
  });
  const carnetId = String(carnetRows[0].id).replace(/^carnet:/, '');
  const carnetRef = recId('carnet', carnetId);

  // 2. Le relevé de ventes sur le canal « depots » : droits d'auteur au prix net facturé.
  let reportId: string | undefined;
  const vendues = lignes.filter((l) => l.ventes || l.sp);
  if (vendues.length) {
    const rep = await query<any>(`CREATE sales_report CONTENT $c`, {
      c: { channel: recId('sales_channel', canal.id), period_start: jour, period_end: finJour, label: `${client.name} — ${opts.label.trim() || 'carnet'}` }
    });
    reportId = String(rep[0].id).replace(/^sales_report:/, '');
    await query(`INSERT INTO sales_line $d`, {
      d: vendues.map((l) => {
        const ht = l.prix_retenu / (1 + l.vat_rate / 100);
        return {
          report: recId('sales_report', reportId!), book: recId('book', l.book_id!), isbn: l.isbn, format: 'paper',
          units_sold: l.ventes, units_returned: 0, units_free: l.sp,
          gross_price: l.prix_retenu, gross_ht: Math.round(ht * 100) / 100, net_receipt: Math.round(ht * (1 - opts.remise / 100) * 100) / 100,
          note: `carnet ${opts.label.trim() || ''}`.trim()
        };
      })
    });
  }

  // 3. Le brouillon de facture au dépositaire.
  let invoiceId: string | undefined;
  const facturables = lignes.filter((l) => l.ventes > 0);
  if (facturables.length) {
    invoiceId = await createManualInvoice({
      kind: 'invoice', clientId, price_mode: 'ttc',
      bill_to: { name: client.name, email: client.email, address_1: [client.address_1, client.address_2].filter(Boolean).join(', ') || undefined, postcode: client.postcode, city: client.city, country: client.country, vat_number: client.vat_number, siret: client.siret, contact_name: client.contact_name },
      lines: facturables.map((l) => ({
        description: `${l.titre_catalogue ?? l.titre}${opts.remise ? ` — prix public ${l.prix_retenu.toFixed(2).replace('.', ',')} €, remise ${opts.remise} %` : ''}`,
        qty: l.ventes, unit_price: l.net_unitaire, vat_rate: l.vat_rate, book: l.book_id, isbn: l.isbn
      })),
      intro: `Carnet de vente « ${opts.label.trim() || 'dépôt'} » du ${opts.sold_at.toLocaleDateString('fr-FR')} : ${apercu.ventes} exemplaire${apercu.ventes > 1 ? 's' : ''} vendu${apercu.ventes > 1 ? 's' : ''}${apercu.sp ? `, ${apercu.sp} en service de presse` : ''}.`,
      issued_at: opts.sold_at
    });
  }

  // 4. Les mouvements du dépôt.
  const mouvements: Record<string, unknown>[] = [];
  for (const l of lignes) {
    const base = { client: cid, book: recId('book', l.book_id!), at: opts.sold_at, carnet: carnetRef };
    // Stock début du carnet pris pour inventaire : posé AVANT les ventes (une seconde plus tôt, pour l'ordre).
    if (opts.alignerDebut && l.ecart_debut) mouvements.push({ ...base, at: new Date(opts.sold_at.getTime() - 1000), kind: 'inventaire', qty: l.ecart_debut, note: `stock début du carnet ${l.stock_debut}, connu ${l.stock_actuel}` });
    if (l.ventes) mouvements.push({ ...base, kind: 'vente', qty: -l.ventes });
    if (l.sp) mouvements.push({ ...base, kind: 'sp', qty: -l.sp });
    if (l.ecart_fin) mouvements.push({ ...base, kind: 'ecart', qty: l.ecart_fin, note: `stock fin compté ${l.stock_fin}, attendu ${l.stock_attendu_fin}` });
  }
  if (mouvements.length) await query(`INSERT INTO depot_movement $d`, { d: mouvements });

  await query(`UPDATE $id MERGE $m`, { id: carnetRef, m: { report: reportId ? recId('sales_report', reportId) : undefined, invoice: invoiceId ? recId('invoice', invoiceId) : undefined } });
  oublierLecture(lecture.token);
  return { carnetId, invoiceId, reportId, ventes: apercu.ventes, sp: apercu.sp, ecarts: apercu.ecarts };
}

export interface CarnetResume {
  id: string; label: string; sold_at: string; status: string; remise: number; ventes: number; sp: number; ca_ttc: number; net_ttc: number;
  invoice_id?: string; invoice_ref?: string; invoice_status?: string; report_id?: string;
}

export async function listCarnets(clientId: string): Promise<CarnetResume[]> {
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, label, sold_at, status, remise, totals, invoice, invoice.ref AS invoice_ref, invoice.status AS invoice_status, report
       FROM carnet WHERE client = $c ORDER BY sold_at DESC LIMIT 100`,
    { c: recId('client', clientId) }
  );
  return rows.map((r: any) => ({
    id: String(r.id), label: r.label, sold_at: r.sold_at, status: r.status, remise: Number(r.remise ?? 0),
    ventes: Number(r.totals?.ventes ?? 0), sp: Number(r.totals?.sp ?? 0), ca_ttc: Number(r.totals?.ca_ttc ?? 0), net_ttc: Number(r.totals?.net_ttc ?? 0),
    invoice_id: r.invoice ? String(r.invoice).replace(/^invoice:/, '') : undefined, invoice_ref: r.invoice_ref ?? undefined, invoice_status: r.invoice_status ?? undefined,
    report_id: r.report ? String(r.report).replace(/^sales_report:/, '') : undefined
  }));
}

/**
 * Annule un carnet : supprime son relevé et ses mouvements ; la facture, si
 * elle est encore brouillon, est supprimée aussi, sinon elle reste (à annuler
 * depuis Facturation).
 */
export async function annulerCarnet(carnetId: string): Promise<{ facture_conservee: boolean }> {
  const c = (await query<any>(`SELECT status, report, invoice, invoice.status AS invoice_status FROM ONLY $id`, { id: recId('carnet', carnetId) })) as any;
  if (!c) throw new Error('Carnet introuvable.');
  if (c.status === 'cancelled') throw new Error('Carnet déjà annulé.');
  // query() rend les liens en « table:id » : on repasse par recId() pour supprimer.
  const report = c.report ? recId('sales_report', String(c.report).replace(/^sales_report:/, '')) : null;
  const invoice = c.invoice ? recId('invoice', String(c.invoice).replace(/^invoice:/, '')) : null;
  await query(`DELETE depot_movement WHERE carnet = $id`, { id: recId('carnet', carnetId) });
  if (report) { await query(`DELETE sales_line WHERE report = $r`, { r: report }); await query(`DELETE $r`, { r: report }); }
  let conservee = false;
  if (invoice) {
    if (c.invoice_status === 'draft') await query(`DELETE $i`, { i: invoice });
    else conservee = true;
  }
  await query(`UPDATE $id MERGE $m`, { id: recId('carnet', carnetId), m: { status: 'cancelled', report: undefined, invoice: conservee ? invoice : undefined } });
  return { facture_conservee: conservee };
}

// ── Gabarit de carnet ─────────────────────────────────────────

/** Carnet vierge pré-rempli avec le stock du dépôt, formules comprises (ventes, CA, stock fin). */
export async function gabaritCarnet(client: ClientPro): Promise<Buffer> {
  const stock = (await stockDepot(client.id)).filter((l) => l.qty > 0);
  const aoa: any[][] = [
    ['ÉDITIONS AGONE — CARNET DE VENTE'],
    [`Dépôt : ${client.name}`, '', '', `Édité le ${new Date().toLocaleDateString('fr-FR')}`],
    ['Événement / date des ventes :', ''],
    [],
    ['COLLECTION', 'ISBN', 'TITRE', 'PPTTC', 'Stock début', 'CB', 'Chèque', 'Espèces', 'Ventes', 'SP', 'CA', 'Stock fin']
  ];
  const debut = aoa.length + 1; // n° de la première ligne de données (1-based)
  for (const l of stock) aoa.push([l.collection ?? '', l.isbn ?? '', l.title, l.price_paper ?? '', l.qty, '', '', '', null, '', null, null]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (let i = 0; i < stock.length; i++) {
    const r = debut + i;
    ws[`I${r}`] = { t: 'n', f: `F${r}+G${r}+H${r}` };
    ws[`K${r}`] = { t: 'n', f: `I${r}*D${r}`, z: '#,##0.00 €' };
    ws[`L${r}`] = { t: 'n', f: `E${r}-I${r}-J${r}` };
  }
  const fin = debut + stock.length;
  ws[`H${fin + 1}`] = { t: 's', v: 'Totaux' };
  ws[`I${fin + 1}`] = { t: 'n', f: `SUM(I${debut}:I${fin})` };
  ws[`J${fin + 1}`] = { t: 'n', f: `SUM(J${debut}:J${fin})` };
  ws[`K${fin + 1}`] = { t: 'n', f: `SUM(K${debut}:K${fin})`, z: '#,##0.00 €' };
  ws['!ref'] = `A1:L${fin + 1}`;
  ws['!cols'] = [{ wch: 18 }, { wch: 15 }, { wch: 44 }, { wch: 9 }, { wch: 11 }, { wch: 6 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 5 }, { wch: 11 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CarnetVente');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
