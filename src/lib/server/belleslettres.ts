/**
 * Intégration Les Belles Lettres (BLDD), distributeur d'Agone.
 *
 *  1) syncBldStock()  — IMPORT stock : scrape authentifié de l'extranet BLDD
 *     (www.bldd.fr), parse la table HTML, écrase book.stock_qty (absolu) par EAN,
 *     journalise les mouvements, envoie un rapport de diff. Lecture seule côté BLDD.
 *
 *  2) exportBlOrders() — EXPORT commandes : génère le fichier EDI largeur fixe
 *     (enregistrements A/B/C, CRLF, ASCII//TRANSLIT) des commandes payées.
 *
 *  ⚠️ SÉCURITÉ : l'envoi FTP reste DÉSACTIVÉ tant que BL_FTP_ENABLED != 'true'.
 *     En dry-run (défaut) : le fichier est stagé (bl_export status='staged') SANS
 *     upload FTP et SANS changement de statut des commandes → ré-exécutable sans risque.
 */
import { env } from '$env/dynamic/private';
import { query, recId } from './surreal';
import { sendMail } from './mail';

const GLN = '3052325760012'; // gencode Agone (fournisseur)
const POSTER_EAN = '9782748906035';
const BLDD_BASE = 'http://www.bldd.fr/editeurs';

export function isBlFtpEnabled(): boolean {
  return String(env.BL_FTP_ENABLED ?? '').trim().toLowerCase() === 'true';
}

// ── helpers largeur fixe ──────────────────────────────────────
/** iconv('UTF-8','ASCII//TRANSLIT') : accents → ASCII, non-ASCII supprimés. */
function ascii(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x00-\x7F]/g, '');
}
/** Tronque puis complète à droite avec des espaces (texte). */
function padR(s: string, len: number): string {
  return ascii(s).slice(0, len).padEnd(len, ' ');
}
/** Complète à gauche avec des zéros (EAN, quantité). */
function padL0(s: string | number, len: number): string {
  return String(s).replace(/\D/g, '').slice(0, len).padStart(len, '0');
}
const CRLF = '\r\n';

// ══════════════════════════════════════════════════════════════
// EXPORT COMMANDES (EDI)
// ══════════════════════════════════════════════════════════════

interface EdiOrder {
  id: string; number: number;
  billing?: any; shipping?: any;
  created_at: string;
  lines: { isbn?: string; sub_end?: string; format: string; qty: number }[];
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Construit le groupe A/B/C d'une commande. Renvoie null si aucune ligne éligible. */
export function buildOrderEdi(o: EdiOrder, today = new Date()): { edi: string; books: number } | null {
  const ship = o.shipping && o.shipping.address_1 ? o.shipping : o.billing ?? {};
  const bill = o.billing ?? {};
  const addr = ship.address_1 ? ship : bill;

  let books = 0, posters = 0, others = 0;
  const cLines: string[] = [];
  for (const l of o.lines) {
    if (l.format === 'epub') continue;
    if (l.format === 'souscription') {
      if (!l.sub_end || !sameDay(new Date(l.sub_end), today)) continue; // parquée tant que la date n'est pas atteinte
    }
    if (!l.isbn) continue;
    cLines.push('C' + padL0(l.isbn, 13) + padL0(l.qty, 6));
    books += l.qty;
    if (l.isbn.replace(/\D/g, '') === POSTER_EAN) posters++; else others++;
  }
  if (books === 0) return null;

  const country = (addr.country || bill.country || 'FR').toUpperCase();
  const isFr = country === 'FR' || country === 'FRANCE';
  // Colisage
  let colis = 'AGOCOLCOL';
  if (!isFr) colis = 'AGOBROBRO';
  else if (others === 0 && posters > 0) colis = 'AGOLETLTR';

  const created = o.created_at ? new Date(o.created_at) : today;
  const dmy = `${String(created.getDate()).padStart(2, '0')}${String(created.getMonth() + 1).padStart(2, '0')}${String(created.getFullYear()).slice(-2)}`;

  const name = `${addr.first_name ?? bill.first_name ?? ''} ${addr.last_name ?? bill.last_name ?? ''}`.trim();
  const A =
    'A' + GLN + 'X' + padL0(o.number, 7) + GLN + dmy + ' '.repeat(9) +
    padR(name, 32) + padR(addr.company ?? '', 32) + padR(addr.address_1 ?? '', 32) +
    padR(addr.address_2 ?? '', 32) + padR(addr.postcode ?? '', 9) + padR(addr.city ?? '', 35) +
    (isFr ? '100' : padR(country.slice(0, 2), 3));

  const email = ship.email || bill.email || '';
  const phone = bill.phone || ship.phone || '';
  const B = 'B' + ' '.repeat(109) + colis + padR(email, 75) + padR(phone, 10);

  return { edi: [A, B, ...cLines].join(CRLF) + CRLF, books };
}

async function fetchExportableOrders(): Promise<EdiOrder[]> {
  const orders = await query<any>(
    `SELECT id, number, billing, shipping, created_at FROM order
       WHERE status = 'paid' AND has_physical = true AND bl_exported_at = NONE
         AND channel IN ['web', 'vpc']
       ORDER BY number`
  );
  const out: EdiOrder[] = [];
  for (const o of orders) {
    const lines = await query<any>(
      `SELECT out.isbn_paper AS isbn, out.subscription_end AS sub_end, format, qty
         FROM contains WHERE in = $id`,
      { id: recId('order', String(o.id)) }
    );
    out.push({ id: String(o.id), number: o.number, billing: o.billing, shipping: o.shipping, created_at: o.created_at, lines });
  }
  return out;
}

/** Upload FTP (uniquement en prod). Utilise curl (comme le PHP historique). */
async function uploadToBlFtp(filename: string, body: string): Promise<boolean> {
  const host = env.BL_FTP_HOST, user = env.BL_FTP_USER, pass = env.BL_FTP_PASS;
  if (!host || !user || !pass) throw new Error('FTP BL non configuré');
  const { execFile } = await import('node:child_process');
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const tmp = join(mkdtempSync(join(tmpdir(), 'bl-')), filename);
  writeFileSync(tmp, body, 'binary');
  return new Promise((resolve) => {
    execFile('curl', ['-sS', '--ftp-create-dirs', '-T', tmp, `ftp://${user}:${pass}@${host}//${filename}`], (err) => resolve(!err));
  });
}

export interface ExportResult {
  filename: string; order_count: number; book_count: number; dry_run: boolean; uploaded: boolean; body: string;
}

/** Génère l'EDI des commandes payées. Dry-run par défaut (aucun FTP, aucun flip de statut). */
export async function exportBlOrders(opts: { force?: boolean } = {}): Promise<ExportResult | null> {
  const orders = await fetchExportableOrders();
  const today = new Date();
  const blocks: string[] = [];
  const orderRefs: string[] = [];
  const orderIds: string[] = [];
  let bookCount = 0;
  for (const o of orders) {
    const b = buildOrderEdi(o, today);
    if (!b) continue;
    blocks.push(b.edi);
    bookCount += b.books;
    orderRefs.push(`X${padL0(o.number, 7)}`);
    orderIds.push(o.id);
  }
  if (blocks.length === 0) return null;

  const ts = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}${String(today.getHours()).padStart(2, '0')}${String(today.getMinutes()).padStart(2, '0')}${String(today.getSeconds()).padStart(2, '0')}`;
  const filename = `CDAGO${ts}.txt`;
  const body = blocks.join('');
  const enabled = isBlFtpEnabled();

  let uploaded = false;
  if (enabled) {
    try { uploaded = await uploadToBlFtp(filename, body); } catch { uploaded = false; }
  }

  // Persiste le fichier généré (source de vérité pour le back-office)
  await query(`CREATE bl_export CONTENT $e`, {
    e: {
      filename, body, order_count: orderIds.length, book_count: bookCount, order_refs: orderRefs,
      dry_run: !enabled, status: enabled ? (uploaded ? 'uploaded' : 'failed') : 'staged',
      uploaded_at: uploaded ? new Date() : undefined
    }
  });

  // Flip de statut UNIQUEMENT après upload FTP réussi (jamais en dry-run)
  if (enabled && uploaded) {
    for (const id of orderIds) {
      await query(`UPDATE $id SET status = 'sent_to_bl', bl_exported_at = time::now()`, { id: recId('order', id) });
    }
  }

  return { filename, order_count: orderIds.length, book_count: bookCount, dry_run: !enabled, uploaded, body };
}

// ══════════════════════════════════════════════════════════════
// IMPORT STOCK (scrape extranet BLDD)
// ══════════════════════════════════════════════════════════════

function parseCell(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

/** Parse la table HTML de stock BLDD → { ean: qty }. Cols : 3=EAN, 18=stock. */
export function parseBlStockHtml(html: string): Map<string, number> {
  const stock = new Map<string, number>();
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  let i = 0;
  for (const row of rows) {
    const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? []).map(parseCell);
    i++;
    if (i === 1) continue; // en-tête
    if (cells.length < 19) continue;
    const ean = (cells[3] ?? '').replace(/\D/g, '');
    const qty = parseInt((cells[18] ?? '').replace(/\D/g, ''), 10);
    if (ean.length >= 12 && Number.isFinite(qty)) stock.set(ean, qty);
  }
  return stock;
}

async function fetchBlStockHtml(): Promise<string> {
  const user = env.BL_EXTRANET_USER, pass = env.BL_EXTRANET_PASS;
  if (!user || !pass) throw new Error('Identifiants extranet BLDD manquants (BL_EXTRANET_USER/PASS)');
  // 1) login → cookie ASP
  const login = await fetch(`${BLDD_BASE}/traitlog.asp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
    body: new URLSearchParams({ login: user, mdp: pass, Submit: 'Envoyer' }),
    redirect: 'manual'
  });
  const setCookie = login.headers.get('set-cookie') ?? '';
  const cookie = (setCookie.match(/ASPSESSIONID\w+=\w+/) ?? [])[0] ?? '';
  // 2) fetch stock du mois courant
  const now = new Date();
  const url = `${BLDD_BASE}/stocks.asp?mts=${now.getMonth() + 1}&yrs=${now.getFullYear()}&com=excel&orderfield=18&orderdir=desc`;
  const res = await fetch(url, { headers: { Cookie: cookie, 'User-Agent': 'Mozilla/5.0' } });
  return res.text();
}

export interface StockSyncResult { matched: number; updated: number; changes: { isbn: string; old: number; new: number }[] }

/** Importe le stock BLDD (lecture seule côté BLDD) → écrase book.stock_qty par EAN. */
export async function syncBldStock(opts: { html?: string; sendReport?: boolean } = {}): Promise<StockSyncResult> {
  const html = opts.html ?? (await fetchBlStockHtml());
  const blStock = parseBlStockHtml(html);

  const books = await query<any>(`SELECT id, isbn_paper, title, stock_qty FROM book WHERE isbn_paper != NONE`);
  const byIsbn = new Map<string, any>();
  for (const b of books) byIsbn.set(String(b.isbn_paper).replace(/\D/g, ''), b);

  const changes: { isbn: string; old: number; new: number }[] = [];
  let matched = 0, updated = 0;
  for (const [ean, qty] of blStock) {
    const book = byIsbn.get(ean);
    if (!book) continue;
    matched++;
    const old = book.stock_qty ?? 0;
    if (old === qty) continue;
    await query(`UPDATE $id SET stock_qty = $q, stock_synced_at = time::now()`, { id: recId('book', String(book.id)), q: qty });
    await query(`CREATE stock_movement CONTENT $m`, {
      m: { book: recId('book', String(book.id)), isbn: ean, old_qty: old, new_qty: qty, delta: qty - old, source: 'bldd' }
    });
    changes.push({ isbn: ean, old, new: qty });
    updated++;
  }

  if (opts.sendReport !== false && changes.length) {
    const rows = changes.slice(0, 200).map((c) => {
      const b = byIsbn.get(c.isbn);
      const d = c.new - c.old;
      const col = d > 0 ? '#15803d' : '#b91c1c';
      return `<tr><td>${b?.title ?? ''}</td><td>${c.isbn}</td><td align="right">${c.old}</td><td align="right">${c.new}</td><td align="right" style="color:${col}">${d > 0 ? '+' : ''}${d}</td></tr>`;
    }).join('');
    await sendMail({
      to: env.MAIL_REPLY_TO || 'contact@agone.org',
      subject: `Stocks Belles Lettres — ${new Date().toLocaleDateString('fr-FR')}`,
      html: `<p>${matched} titres appariés, <strong>${updated} mis à jour</strong>.</p>
        <table cellpadding="4" style="border-collapse:collapse;font-family:Arial;font-size:13px"><tr><th align="left">Titre</th><th>EAN</th><th>Ancien</th><th>Nouveau</th><th>Δ</th></tr>${rows}</table>`
    });
  }

  return { matched, updated, changes };
}

// ══════════════════════════════════════════════════════════════
// IMPORT VENTES (scrape extranet BLDD — « État des ventes et retours »)
// ══════════════════════════════════════════════════════════════

export interface BlSalesLine {
  isbn: string; author: string; title: string;
  units_sold: number; units_returned: number;
  /** Prix public HT : chiffre des ventes, des retours, et net des deux. */
  gross_ht: number; returns_ht: number; net_ht: number;
  /** Montant HT réellement facturé par le distributeur (après remise libraire). */
  invoiced_ht: number;
}

/** « 1 234,56 » → 1234.56 ; vide → 0. */
function nombreFr(s: string): number {
  const n = Number(String(s).replace(/\s/g, '').replace(/\u00a0/g, '').replace(',', '.').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parse « État des ventes et retours » de l'extranet BLDD.
 * Colonnes du détail : 0 auteur, 1 ISBN, 2 titre, 3 ventes, 4 retours,
 * 5 CA PP HT vente, 6 CA PP HT retour, 7 net, 8 facturé.
 */
export function parseBlSalesHtml(html: string): BlSalesLine[] {
  const out: BlSalesLine[] = [];
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  for (const row of rows) {
    const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? []).map(parseCell);
    if (cells.length < 9) continue;
    const isbn = (cells[1] ?? '').replace(/\D/g, '');
    if (isbn.length < 12) continue; // en-têtes et lignes de synthèse
    out.push({
      isbn, author: cells[0] ?? '', title: cells[2] ?? '',
      units_sold: Math.round(nombreFr(cells[3])),
      units_returned: Math.abs(Math.round(nombreFr(cells[4]))),
      gross_ht: nombreFr(cells[5]), returns_ht: nombreFr(cells[6]),
      net_ht: nombreFr(cells[7]), invoiced_ht: nombreFr(cells[8])
    });
  }
  return out;
}

/** Session ASP de l'extranet (login commun au stock et aux ventes). */
async function cookieBldd(): Promise<string> {
  const user = env.BL_EXTRANET_USER, pass = env.BL_EXTRANET_PASS;
  if (!user || !pass) throw new Error('Identifiants extranet BLDD manquants (BL_EXTRANET_USER/PASS)');
  const login = await fetch(`${BLDD_BASE}/traitlog.asp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
    body: new URLSearchParams({ login: user, mdp: pass, Submit: 'Envoyer' }),
    redirect: 'manual'
  });
  const setCookie = login.headers.get('set-cookie') ?? '';
  return (setCookie.match(/ASPSESSIONID\w+=\w+/) ?? [])[0] ?? '';
}

const jjmmaaaa = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

/**
 * Récupère l'état des ventes BLDD sur une période (lecture seule côté BLDD).
 * `Filtre` vaut Papiers, Num ou All : on prend TOUT et le format se déduit de
 * l'ISBN à l'import (le distributeur ne rend aujourd'hui que du papier, mais
 * l'onglet numérique existe).
 */
export async function fetchBlSales(from: Date, to: Date, filtre: 'Papiers' | 'Num' | 'All' = 'All'): Promise<BlSalesLine[]> {
  const cookie = await cookieBldd();
  const url = `${BLDD_BASE}/ventes.asp?DateFrom=${encodeURIComponent(jjmmaaaa(from))}&DateTo=${encodeURIComponent(jjmmaaaa(to))}&Filtre=${filtre}`;
  const res = await fetch(url, { headers: { Cookie: cookie, 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Extranet BLDD : HTTP ${res.status}`);
  return parseBlSalesHtml(await res.text());
}

// ══════════════════════════════════════════════════════════════
// MOUVEMENTS MENSUELS (la page de stock porte bien plus que le stock)
// ══════════════════════════════════════════════════════════════

/**
 * Une ligne de la page de stock BLDD, lue en entier.
 *
 * Le PHP historique n'y prenait que l'EAN et le stock ; les 22 colonnes donnent
 * en réalité tout le mouvement du mois, y compris les SERVICES DE PRESSE et le
 * stock de début et de fin — exactement les mentions qu'impose l'article 6 des
 * contrats d'auteur (exemplaires fabriqués, stock d'ouverture et de clôture,
 * exemplaires hors droits).
 */
export interface BlStockRow {
  ean: string; author: string; title: string; code_bldd: string;
  stock_start: number; inventory: number; entries: number; exits: number;
  gross_sales: number; returns_credited: number; net_sales: number;
  free_copies: number; deposits: number; counter: number;
  stock_publisher: number; stock_warehouse: number; stock_end: number;
  returns_pending: number;
}

const entier = (s: string) => {
  const n = parseInt(String(s).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

/** Parse la page de stock mensuelle → une ligne par titre, toutes colonnes. */
export function parseBlStockRows(html: string): BlStockRow[] {
  const out: BlStockRow[] = [];
  for (const row of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
    const c = (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? []).map(parseCell);
    if (c.length < 20) continue;
    const ean = (c[3] ?? '').replace(/\D/g, '');
    if (ean.length < 12) continue; // en-tête
    out.push({
      ean, author: c[0] ?? '', title: c[1] ?? '', code_bldd: (c[2] ?? '').trim(),
      stock_start: entier(c[7]), inventory: entier(c[8]), entries: entier(c[9]), exits: entier(c[10]),
      gross_sales: entier(c[11]), returns_credited: entier(c[12]), net_sales: entier(c[13]),
      free_copies: entier(c[14]), deposits: entier(c[15]), counter: entier(c[16]),
      stock_publisher: entier(c[17]), stock_warehouse: entier(c[18]), stock_end: entier(c[19]),
      returns_pending: entier(c[20])
    });
  }
  return out;
}

/** Page de stock d'un mois donné (lecture seule côté BLDD). */
export async function fetchBlStockMonth(month: number, year: number): Promise<BlStockRow[]> {
  const cookie = await cookieBldd();
  const url = `${BLDD_BASE}/stocks.asp?mts=${month}&yrs=${year}&com=excel&orderfield=18&orderdir=desc`;
  const res = await fetch(url, { headers: { Cookie: cookie, 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Extranet BLDD : HTTP ${res.status}`);
  return parseBlStockRows(await res.text());
}

// ══════════════════════════════════════════════════════════════
// VENTES DÉTAILLÉES (par librairie) — sert à isoler l'export
// ══════════════════════════════════════════════════════════════

export interface BlSaleDetail {
  client: string; address: string; cp: string; city: string;
  sold: number; returned: number; date: string; abroad: boolean;
}

/**
 * Hors France : le relevé ne porte pas de pays, mais un code postal français
 * tient toujours sur cinq chiffres. Une adresse belge (1000), suisse (1211) ou
 * vide sort donc du lot. Sert au taux réduit de moitié que prévoient les contrats
 * pour les ventes hors France.
 */
export const venteHorsFrance = (cp: string) => !/^\d{5}$/.test(String(cp).trim());

/** Parse le journal des ventes d'un titre : une ligne par librairie et par date. */
export function parseBlSalesDetailHtml(html: string): BlSaleDetail[] {
  const out: BlSaleDetail[] = [];
  for (const row of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
    const c = (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? []).map(parseCell);
    if (c.length < 7) continue;
    const date = (c[6] ?? '').trim();
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date)) continue; // en-têtes et totaux
    out.push({
      client: c[0] ?? '', address: c[1] ?? '', cp: (c[2] ?? '').trim(), city: c[3] ?? '',
      sold: entier(c[4]), returned: Math.abs(entier(c[5])), date, abroad: venteHorsFrance(c[2] ?? '')
    });
  }
  return out;
}

/** Code article BLDD d'un titre (clé du journal des ventes), lu sur sa fiche. */
export async function fetchBlCodeArticle(ean: string): Promise<string | null> {
  const cookie = await cookieBldd();
  const res = await fetch(`${BLDD_BASE}/ProductStock.asp?CodeEAN13=${encodeURIComponent(ean)}&d=${jjmmaaaa(new Date())}`, {
    headers: { Cookie: cookie, 'User-Agent': 'Mozilla/5.0' }
  });
  if (!res.ok) return null;
  return ((await res.text()).match(/codearticle=(\d+)/) ?? [])[1] ?? null;
}

/** Journal des ventes d'un titre sur une période (par librairie). */
export async function fetchBlSalesDetail(codeArticle: string, from: Date, to: Date): Promise<BlSaleDetail[]> {
  const cookie = await cookieBldd();
  const url = `${BLDD_BASE}/detailventes.asp?codearticle=${encodeURIComponent(codeArticle)}`
    + `&DateFrom=${encodeURIComponent(jjmmaaaa(from))}&DateTo=${encodeURIComponent(jjmmaaaa(to))}`;
  const res = await fetch(url, { headers: { Cookie: cookie, 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Extranet BLDD : HTTP ${res.status}`);
  return parseBlSalesDetailHtml(await res.text());
}
