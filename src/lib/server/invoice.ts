/**
 * Facturation — factures & avoirs.
 *
 * Numérotation LÉGALE continue par année (« 2026-0001 »). Une facture est
 * IMMUABLE : lignes + client figés (snapshot). Prix TTC, TVA (livres 5,5 %).
 * Générée automatiquement à la commande payée, ou créée manuellement (facture/avoir).
 * Infos société éditables dans Paramètres (clé de réglage « billing »).
 */
import { query, recId } from './surreal';
import { getSetting } from './site';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/* ————————————————————— Société émettrice (réglages) ————————————————————— */

export interface Company {
  legal_name: string;
  address: string;
  siret?: string;
  vat_number?: string;
  rcs?: string;
  ape?: string;
  iban?: string;
  bic?: string;
  email?: string;
  phone?: string;
  capital?: string;
  footer?: string;
  vat_rate: number;
}

export async function getCompany(): Promise<Company> {
  const s = ((await getSetting('billing')) as Record<string, any>) ?? {};
  return {
    legal_name: s.legal_name || 'Éditions Agone',
    address: s.address || '',
    siret: s.siret || undefined,
    vat_number: s.vat_number || undefined,
    rcs: s.rcs || undefined,
    ape: s.ape || undefined,
    iban: s.iban || undefined,
    bic: s.bic || undefined,
    email: s.email || undefined,
    phone: s.phone || undefined,
    capital: s.capital || undefined,
    footer: s.footer || undefined,
    vat_rate: s.vat_rate != null && s.vat_rate !== '' ? Number(s.vat_rate) : 5.5
  };
}

/* ————————————————————— Numérotation ————————————————————— */

/** Séquence continue par année via site_setting.counters.invoice_<année>. */
async function nextInvoiceRef(year: number): Promise<{ number: number; ref: string }> {
  const field = `invoice_${year}`; // année = entier maîtrisé, interpolation sûre
  const rows = await query<any>(
    `UPDATE site_setting SET value.${field} = (value.${field} ?? 0) + 1 WHERE key = 'counters' RETURN AFTER`
  );
  let n = rows[0]?.value?.[field];
  if (n == null) {
    await query(`CREATE site_setting CONTENT { key: 'counters', value: { ${field}: 1 } }`);
    n = 1;
  }
  return { number: n, ref: `${year}-${String(n).padStart(4, '0')}` };
}

/* ————————————————————— Totaux (prix TTC → HT + TVA) ————————————————————— */

export interface InvoiceLine {
  description: string;
  qty: number;
  unit_price_ttc: number;
  line_total_ttc: number;
}

function computeTotals(lines: InvoiceLine[], vatRate: number) {
  const total_ttc = r2(lines.reduce((s, l) => s + l.qty * l.unit_price_ttc, 0));
  const subtotal_ht = r2(total_ttc / (1 + vatRate / 100));
  const tax_total = r2(total_ttc - subtotal_ht);
  return { total_ttc, subtotal_ht, tax_total };
}

/* ————————————————————— Snapshot client ————————————————————— */

function billToFromAddress(name: string, email: string, addr: Record<string, any>) {
  return {
    name: name || [addr.first_name, addr.last_name].filter(Boolean).join(' ') || email || 'Client',
    email: email || addr.email || undefined,
    address_1: addr.address_1 || addr.address || undefined,
    postcode: addr.postcode || undefined,
    city: addr.city || undefined,
    country: addr.country || undefined
  };
}

/* ————————————————————— Création automatique (depuis une commande) ————————————————————— */

/** Crée la facture d'une commande (idempotent). Renvoie l'id de facture. */
export async function createInvoiceForOrder(orderId: string): Promise<string | null> {
  const existing = await query<any>(`SELECT meta::id(id) AS id FROM invoice WHERE order = $o LIMIT 1`, {
    o: recId('order', orderId)
  });
  if (existing[0]) return existing[0].id;

  const o = (
    await query<any>(`SELECT number, customer, email, billing, shipping FROM order WHERE id = $id LIMIT 1`, {
      id: recId('order', orderId)
    })
  )[0];
  if (!o) return null;

  const rawLines = await query<any>(
    `SELECT out.title AS title, title_snapshot, format, qty, unit_price FROM contains WHERE in = $id`,
    { id: recId('order', orderId) }
  );
  const cleanText = (s: string) =>
    s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/\s+/g, ' ').trim();
  const lines: InvoiceLine[] = rawLines.map((l) => ({
    description: `${cleanText(String(l.title_snapshot || l.title || 'Livre'))}${l.format && l.format !== 'papier' ? ` (${l.format})` : ''}`,
    qty: l.qty ?? 1,
    unit_price_ttc: l.unit_price ?? 0,
    line_total_ttc: r2((l.qty ?? 1) * (l.unit_price ?? 0))
  }));

  let name = '';
  let email = o.email ?? '';
  if (o.customer) {
    const u = (await query<any>(`SELECT full_name, email FROM $id`, { id: recId('user', String(o.customer)) }))[0];
    name = u?.full_name || '';
    email = email || u?.email || '';
  }
  const bill_to = billToFromAddress(name, email, o.billing ?? o.shipping ?? {});

  const { vat_rate } = await getCompany();
  const totals = computeTotals(lines, vat_rate);
  const year = new Date().getFullYear();
  const { number, ref } = await nextInvoiceRef(year);

  const rows = await query<any>(`CREATE invoice CONTENT $c`, {
    c: {
      year, number, ref, kind: 'invoice',
      order: recId('order', orderId),
      customer: o.customer ? recId('user', String(o.customer)) : undefined,
      bill_to, lines, vat_rate, ...totals
    }
  });
  return String(rows[0].id).replace(/^invoice:/, '');
}

/* ————————————————————— Création manuelle (facture ou avoir) ————————————————————— */

export interface ManualInvoiceInput {
  kind: 'invoice' | 'credit_note';
  customerId?: string;
  bill_to: { name: string; email?: string; address_1?: string; postcode?: string; city?: string; country?: string };
  lines: { description: string; qty: number; unit_price_ttc: number }[];
  vat_rate?: number;
  notes?: string;
}

export async function createManualInvoice(input: ManualInvoiceInput): Promise<string> {
  const vat_rate = input.vat_rate != null ? input.vat_rate : (await getCompany()).vat_rate;
  const lines: InvoiceLine[] = input.lines
    .filter((l) => l.description.trim() && l.qty > 0)
    .map((l) => ({
      description: l.description.trim(),
      qty: l.qty,
      unit_price_ttc: r2(l.unit_price_ttc),
      line_total_ttc: r2(l.qty * l.unit_price_ttc)
    }));
  const totals = computeTotals(lines, vat_rate);
  const year = new Date().getFullYear();
  const { number, ref } = await nextInvoiceRef(year);
  const rows = await query<any>(`CREATE invoice CONTENT $c`, {
    c: {
      year, number, ref, kind: input.kind,
      customer: input.customerId ? recId('user', input.customerId) : undefined,
      bill_to: input.bill_to, lines, vat_rate, ...totals,
      notes: input.notes || undefined
    }
  });
  return String(rows[0].id).replace(/^invoice:/, '');
}

/* ————————————————————— Lecture ————————————————————— */

const INV_FIELDS = `
  meta::id(id) AS id, ref, kind, year, number, bill_to, lines, vat_rate,
  subtotal_ht, tax_total, total_ttc, notes, issued_at, order.number AS order_number
`;

export async function getInvoice(id: string) {
  const rows = await query<any>(`SELECT ${INV_FIELDS} FROM invoice WHERE id = $id LIMIT 1`, {
    id: recId('invoice', id)
  });
  return rows[0] ?? null;
}

export async function getInvoiceIdForOrder(orderId: string): Promise<string | null> {
  const rows = await query<any>(`SELECT meta::id(id) AS id FROM invoice WHERE order = $o LIMIT 1`, {
    o: recId('order', orderId)
  });
  return rows[0]?.id ?? null;
}

export async function listInvoices(opts: { q?: string; kind?: string; limit?: number; offset?: number } = {}) {
  const where: string[] = [];
  const vars: Record<string, unknown> = { limit: opts.limit ?? 50, start: opts.offset ?? 0 };
  if (opts.kind) { where.push('kind = $kind'); vars.kind = opts.kind; }
  if (opts.q && opts.q.trim()) {
    vars.q = opts.q.trim().toLowerCase();
    where.push('(string::lowercase(ref) CONTAINS $q OR string::lowercase(bill_to.name ?? "") CONTAINS $q)');
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, ref, kind, bill_to.name AS name, total_ttc, issued_at, order.number AS order_number
       FROM invoice ${whereSql} ORDER BY issued_at DESC LIMIT $limit START $start`,
    vars
  );
  const count = await query<any>(`SELECT count() AS n FROM invoice ${whereSql} GROUP ALL`, vars);
  return { invoices: rows, total: count[0]?.n ?? 0 };
}

/* ————————————————————— PDF (pdf-lib) ————————————————————— */

const fmtEur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '');

export async function renderInvoicePdf(id: string): Promise<Uint8Array> {
  const inv = await getInvoice(id);
  if (!inv) throw new Error('Facture introuvable');
  const company = await getCompany();
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const W = page.getWidth();
  const H = page.getHeight();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.08, 0.08);
  const grey = rgb(0.45, 0.45, 0.45);

  const M = 48;
  const text = (s: string, x: number, yTop: number, opts: { size?: number; bold?: boolean; color?: any; right?: number } = {}) => {
    const size = opts.size ?? 9;
    const f = opts.bold ? bold : font;
    let xx = x;
    if (opts.right != null) xx = opts.right - f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: xx, y: H - yTop, size, font: f, color: opts.color ?? ink });
  };
  const hline = (yTop: number, x1 = M, x2 = W - M, c = rgb(0.85, 0.85, 0.85)) =>
    page.drawLine({ start: { x: x1, y: H - yTop }, end: { x: x2, y: H - yTop }, thickness: 0.7, color: c });

  const isCredit = inv.kind === 'credit_note';

  // — En-tête société (gauche) —
  let y = M + 4;
  text(company.legal_name, M, y, { size: 14, bold: true });
  y += 16;
  for (const l of String(company.address || '').split('\n').map((s) => s.trim()).filter(Boolean)) {
    text(l, M, y, { size: 9, color: grey }); y += 12;
  }
  const idBits = [company.siret ? `SIRET ${company.siret}` : '', company.vat_number ? `TVA ${company.vat_number}` : '']
    .filter(Boolean).join('  ·  ');
  if (idBits) { text(idBits, M, y, { size: 8, color: grey }); y += 12; }

  // — Titre + réf (droite) —
  text(isCredit ? 'AVOIR' : 'FACTURE', W - M, M + 6, { size: 20, bold: true, right: W - M });
  text(`N° ${inv.ref}`, W - M, M + 26, { size: 11, bold: true, right: W - M });
  text(`Date : ${fmtDate(inv.issued_at)}`, W - M, M + 42, { size: 9, color: grey, right: W - M });
  if (inv.order_number) text(`Commande n° ${inv.order_number}`, W - M, M + 55, { size: 9, color: grey, right: W - M });

  // — Facturé à —
  y = Math.max(y, M + 70) + 22;
  text('Facturé à', M, y, { size: 8, bold: true, color: grey }); y += 14;
  const bt = inv.bill_to ?? {};
  text(bt.name || 'Client', M, y, { size: 10, bold: true }); y += 13;
  for (const l of [bt.address_1, [bt.postcode, bt.city].filter(Boolean).join(' '), bt.country, bt.email].filter(Boolean)) {
    text(String(l), M, y, { size: 9, color: grey }); y += 12;
  }

  // — Tableau des lignes —
  y += 18;
  const colQty = W - M - 210;
  const colPU = W - M - 120;
  const colTot = W - M;
  text('Désignation', M, y, { size: 8, bold: true, color: grey });
  text('Qté', colQty, y, { size: 8, bold: true, color: grey, right: colQty + 30 });
  text('P.U. TTC', colPU, y, { size: 8, bold: true, color: grey, right: colPU + 70 });
  text('Total TTC', colTot, y, { size: 8, bold: true, color: grey, right: colTot });
  y += 6; hline(y); y += 14;

  for (const l of (inv.lines ?? []) as InvoiceLine[]) {
    let desc = l.description || '';
    if (desc.length > 58) desc = desc.slice(0, 57) + '…';
    text(desc, M, y, { size: 9 });
    text(String(l.qty), colQty, y, { size: 9, right: colQty + 30 });
    text(fmtEur(l.unit_price_ttc), colPU, y, { size: 9, right: colPU + 70 });
    text(fmtEur(l.line_total_ttc), colTot, y, { size: 9, right: colTot });
    y += 15;
  }
  y += 2; hline(y); y += 16;

  // — Totaux (droite) —
  const sign = isCredit ? -1 : 1;
  const totRows: [string, string, boolean][] = [
    [`Total HT`, fmtEur(sign * inv.subtotal_ht), false],
    [`TVA ${String(inv.vat_rate).replace('.', ',')} %`, fmtEur(sign * inv.tax_total), false],
    [`Total TTC`, fmtEur(sign * inv.total_ttc), true]
  ];
  for (const [k, v, b] of totRows) {
    text(k, colPU, y, { size: b ? 11 : 9, bold: b });
    text(v, colTot, y, { size: b ? 11 : 9, bold: b, right: colTot });
    y += b ? 18 : 14;
  }

  if (inv.notes) { y += 10; for (const l of String(inv.notes).split('\n')) { text(l, M, y, { size: 9, color: grey }); y += 12; } }

  // — Pied de page (mentions légales) —
  let fy = H - 70;
  const footBits = [
    company.footer,
    [company.iban ? `IBAN ${company.iban}` : '', company.bic ? `BIC ${company.bic}` : ''].filter(Boolean).join('  ·  '),
    [company.rcs ? `RCS ${company.rcs}` : '', company.ape ? `APE ${company.ape}` : '', company.capital ? `Capital ${company.capital}` : ''].filter(Boolean).join('  ·  '),
    isCredit ? '' : 'TVA acquittée sur les encaissements. Pas d’escompte pour paiement anticipé.'
  ].filter(Boolean) as string[];
  page.drawLine({ start: { x: M, y: fy + 8 }, end: { x: W - M, y: fy + 8 }, thickness: 0.7, color: rgb(0.85, 0.85, 0.85) });
  for (const l of footBits) {
    page.drawText(l, { x: M, y: fy, size: 7.5, font, color: grey });
    fy -= 11;
  }

  return doc.save();
}
