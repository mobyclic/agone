/**
 * Facturation — factures & avoirs.
 *
 * Numérotation LÉGALE continue par année (« 2026-0001 »). Une facture est
 * IMMUABLE : lignes + client figés (snapshot). Prix TTC, TVA (livres 5,5 %).
 * Générée automatiquement à la commande payée, ou créée manuellement (facture/avoir).
 * Infos société éditables dans Paramètres (clé de réglage « billing »).
 */
import { query, recId } from './surreal';
import { synchroniserVentesFacture } from './facturesVentes';
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
  vat_rate: number; // taux par défaut des lignes libres (réglable dans Paramètres)
  vat_rates: number[]; // taux disponibles (sélecteur)
}

export async function getCompany(): Promise<Company> {
  const s = ((await getSetting('billing')) as Record<string, any>) ?? {};
  const rates = Array.isArray(s.vat_rates) && s.vat_rates.length
    ? s.vat_rates.map(Number).filter((n: number) => !Number.isNaN(n))
    : [5.5, 20, 10, 2.1, 0];
  // Taux des lignes libres (frais, prestations…) : 20 % ; les livres portent leur propre taux.
  const vat_rate = s.vat_rate != null && s.vat_rate !== '' ? Number(s.vat_rate) : 20;
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
    vat_rate,
    vat_rates: rates.includes(vat_rate) ? rates : [vat_rate, ...rates]
  };
}

/* ————————————————————— Numérotation ————————————————————— */

/**
 * Séquence continue par année via site_setting.counters.invoice_<année> ; les
 * proformas ont la leur (proforma_<année>, « PRO-2026-0001 ») : elles ne
 * consomment pas de numéro de facture.
 */
async function nextInvoiceRef(year: number, kind: 'invoice' | 'proforma' = 'invoice'): Promise<{ number: number; ref: string }> {
  const field = `${kind}_${year}`; // année = entier maîtrisé, interpolation sûre
  const rows = await query<any>(
    `UPDATE site_setting SET value.${field} = (value.${field} ?? 0) + 1 WHERE key = 'counters' RETURN AFTER`
  );
  let n = rows[0]?.value?.[field];
  if (n == null) {
    await query(`CREATE site_setting CONTENT { key: 'counters', value: { ${field}: 1 } }`);
    n = 1;
  }
  return { number: n, ref: `${kind === 'proforma' ? 'PRO-' : ''}${year}-${String(n).padStart(4, '0')}` };
}

/* ————————————————————— Totaux (prix TTC → HT + TVA) ————————————————————— */

export interface InvoiceLine {
  description: string;
  qty: number;
  unit_price_ttc: number;
  line_total_ttc: number;
  vat_rate: number; // TVA de la ligne (%)
  /** Prix unitaire HT (toujours renseigné ; saisi tel quel en mode HT). */
  unit_price_ht?: number;
  /** Titre du catalogue, s'il y en a un derrière la ligne. */
  book?: string;
  isbn?: string;
}

/**
 * Totaux d'une facture multi-taux. En mode TTC, les montants partent du prix TTC
 * (HT = TTC / (1 + taux)) ; en mode HT, du prix HT saisi (TVA = HT × taux), pour
 * que 500 × 1,50 € fassent bien 750,00 € HT et non le TTC arrondi ramené en HT.
 */
function computeTotals(lines: InvoiceLine[], mode: 'ttc' | 'ht' = 'ttc') {
  let total_ttc = 0;
  let subtotal_ht = 0;
  for (const l of lines) {
    const rate = l.vat_rate ?? 0;
    if (mode === 'ht' && l.unit_price_ht != null) {
      const ht = l.qty * l.unit_price_ht;
      subtotal_ht += ht;
      total_ttc += ht * (1 + rate / 100);
    } else {
      const ttc = l.qty * l.unit_price_ttc;
      total_ttc += ttc;
      subtotal_ht += ttc / (1 + rate / 100);
    }
  }
  total_ttc = r2(total_ttc);
  subtotal_ht = r2(subtotal_ht);
  return { total_ttc, subtotal_ht, tax_total: r2(total_ttc - subtotal_ht) };
}

/** Ventilation de la TVA par taux (pour l'affichage et le PDF), dans le sens du document. */
export function vatBreakdown(lines: InvoiceLine[], mode: 'ttc' | 'ht' = 'ttc'): { rate: number; base_ht: number; tax: number }[] {
  const byRate = new Map<number, { ht: number; ttc: number }>();
  for (const l of lines) {
    const rate = l.vat_rate ?? 0;
    const e = byRate.get(rate) ?? { ht: 0, ttc: 0 };
    if (mode === 'ht' && l.unit_price_ht != null) { const ht = l.qty * l.unit_price_ht; e.ht += ht; e.ttc += ht * (1 + rate / 100); }
    else { const ttc = l.qty * l.unit_price_ttc; e.ttc += ttc; e.ht += ttc / (1 + rate / 100); }
    byRate.set(rate, e);
  }
  return [...byRate.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, e]) => ({ rate, base_ht: r2(e.ht), tax: r2(r2(e.ttc) - r2(e.ht)) }));
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
    await query<any>(`SELECT number, customer, email, billing, shipping, status, channel, payment_method, paid_at, total, subtotal, discount_total, shipping_total FROM order WHERE id = $id LIMIT 1`, {
      id: recId('order', orderId)
    })
  )[0];
  if (!o) return null;

  const rawLines = await query<any>(
    `SELECT out.title AS title, out.vat_rate AS vat, meta::id(out) AS book, out.isbn_paper AS isbn, title_snapshot, format, qty, unit_price, line_total, discount FROM contains WHERE in = $id`,
    { id: recId('order', orderId) }
  );
  const { vat_rate } = await getCompany(); // TVA par défaut, si le livre n'en porte pas
  const cleanText = (s: string) =>
    s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/\s+/g, ' ').trim();
  // Remise de la commande : celle de chaque ligne si elle est stockée, sinon répartie au prorata
  // (commandes antérieures au stockage par ligne). La facture doit égaler ce que le client a payé.
  const brut = rawLines.reduce((n: number, l: any) => n + Number(l.line_total ?? (l.qty ?? 1) * (l.unit_price ?? 0)), 0);
  const remiseCommande = Number(o.discount_total ?? 0);
  const parLigne = rawLines.some((l: any) => Number(l.discount ?? 0) > 0);
  const euro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
  const lines: InvoiceLine[] = rawLines.map((l) => {
    const vat = Number.isFinite(Number(l.vat)) ? Number(l.vat) : vat_rate;
    const qty = Number(l.qty ?? 1) || 1;
    const total = Number(l.line_total ?? qty * (l.unit_price ?? 0));
    const remise = parLigne ? Number(l.discount ?? 0) : brut > 0 ? r2((remiseCommande * total) / brut) : 0;
    const unitaire = r2((total - remise) / qty);
    const titre = `${cleanText(String(l.title_snapshot || l.title || 'Livre'))}${l.format && l.format !== 'papier' ? ` (${l.format})` : ''}`;
    return {
      description: remise > 0 ? `${titre} — prix public ${euro(Number(l.unit_price ?? 0))}, remise −${euro(remise)}` : titre,
      qty,
      unit_price_ttc: unitaire,
      unit_price_ht: r2(unitaire / (1 + vat / 100)),
      line_total_ttc: r2(qty * unitaire),
      vat_rate: vat, book: l.book ? String(l.book) : undefined, isbn: l.isbn ?? undefined
    };
  });

  let name = '';
  let email = o.email ?? '';
  if (o.customer) {
    const u = (await query<any>(`SELECT full_name, email FROM $id`, { id: recId('user', String(o.customer)) }))[0];
    name = u?.full_name || '';
    email = email || u?.email || '';
  }
  const bill_to = billToFromAddress(name, email, o.billing ?? o.shipping ?? {});
  const totals = computeTotals(lines);
  // Frais de port à leur propre taux (20 %, comme sur les factures saisies à la main).
  const portTTC = Number(o.shipping_total ?? 0);
  const portTaux = 20;
  const portHT = portTTC > 0 ? r2(portTTC / (1 + portTaux / 100)) : 0;
  if (portHT) {
    totals.subtotal_ht = r2(totals.subtotal_ht + portHT);
    totals.total_ttc = r2(totals.total_ttc + portTTC);
    totals.tax_total = r2(totals.total_ttc - totals.subtotal_ht);
  }
  const year = new Date().getFullYear();
  const { number, ref } = await nextInvoiceRef(year);

  const rows = await query<any>(`CREATE invoice CONTENT $c`, {
    c: {
      year, number, ref, kind: 'invoice',
      order: recId('order', orderId),
      customer: o.customer ? recId('user', String(o.customer)) : undefined,
      bill_to, lines, vat_rate, ...totals,
      shipping_ht: portHT || undefined, shipping_vat_rate: portHT ? portTaux : undefined
    }
  });
  const id = String(rows[0].id).replace(/^invoice:/, '');
  // Une commande payée est réglée du même coup : le règlement s'enregistre avec
  // son mode (Stripe pour le site, sinon celui saisi sur la commande).
  if (PAYEES.has(o.status)) {
    const method = PAYMENT_METHODS.includes(o.payment_method) ? o.payment_method : o.channel === 'web' ? 'stripe' : 'autre';
    await addPayment(id, { amount: totals.total_ttc, paid_at: o.paid_at ? new Date(o.paid_at) : new Date(), method, note: `Commande n° ${o.number}` });
  }
  return id;
}

/* ————————————————————— Règlements ————————————————————— */

const PAYEES = new Set(['paid', 'processing', 'sent_to_bl', 'completed']);
export const PAYMENT_METHODS = ['stripe', 'sumup', 'especes', 'cheque', 'virement', 'autre'];

export async function listPayments(invoiceId: string) {
  return query<any>(
    `SELECT meta::id(id) AS id, amount, paid_at, method, reference, note,
            IF credit_note != NONE THEN meta::id(credit_note) ELSE NONE END AS credit_note_id, credit_note.ref AS credit_note_ref,
            IF applied_to != NONE THEN meta::id(applied_to) ELSE NONE END AS applied_to_id, applied_to.ref AS applied_to_ref
       FROM invoice_payment WHERE invoice = $i ORDER BY paid_at ASC`,
    { i: recId('invoice', invoiceId) }
  );
}

/** Les factures ouvertes (à encaisser, partielles) du même client qu'un avoir : celles où l'imputer. */
export async function facturesImputables(avoirId: string) {
  const a = (await query<any>(`SELECT client, customer, bill_to FROM ONLY $id`, { id: recId('invoice', avoirId) })) as any;
  if (!a) return [];
  const cond = a.client ? 'client = $c' : a.customer ? 'customer = $c' : 'string::lowercase(bill_to.name ?? "") = $n';
  const vars: Record<string, unknown> = { c: a.client ?? a.customer, n: String(a.bill_to?.name ?? '').toLowerCase() };
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, ref, issued_at, total_ttc, paid_total, status FROM invoice
      WHERE kind = 'invoice' AND status IN ['unpaid','partial'] AND ${cond} ORDER BY issued_at ASC`, vars
  );
  return rows.map((r: any) => ({ ...r, reste: r2(Number(r.total_ttc ?? 0) - Number(r.paid_total ?? 0)) }));
}

/**
 * Imputation d'un avoir sur une facture du même client : la facture reçoit un
 * règlement « avoir » et l'avoir le règlement miroir, chacun du même montant
 * (au plus ce qui reste des deux côtés). Les deux états suivent.
 */
export async function imputerAvoir(avoirId: string, factureId: string, montant?: number): Promise<{ montant: number }> {
  const [a, f] = await Promise.all([getInvoice(avoirId), getInvoice(factureId)]);
  if (!a || a.kind !== 'credit_note') throw new Error('Avoir introuvable.');
  if (!f || f.kind !== 'invoice') throw new Error('Facture introuvable.');
  if (!['unpaid', 'partial'].includes(a.status)) throw new Error('Cet avoir est déjà soldé.');
  if (!['unpaid', 'partial'].includes(f.status)) throw new Error('Cette facture n’a rien à régler.');
  const memeClient = (a.client_id && a.client_id === f.client_id) || (a.customer_id && a.customer_id === f.customer_id)
    || String(a.bill_to?.name ?? '').toLowerCase() === String(f.bill_to?.name ?? '').toLowerCase();
  if (!memeClient) throw new Error('L’avoir et la facture ne sont pas au même client.');
  const resteAvoir = r2(Number(a.total_ttc) - Number(a.paid_total ?? 0));
  const resteFacture = r2(Number(f.total_ttc) - Number(f.paid_total ?? 0));
  const m = r2(Math.min(resteAvoir, resteFacture, montant && montant > 0 ? montant : Infinity));
  if (!(m > 0)) throw new Error('Rien à imputer.');
  const quand = new Date();
  await query(`CREATE invoice_payment CONTENT $c`, { c: { invoice: recId('invoice', factureId), amount: m, paid_at: quand, method: 'avoir', credit_note: recId('invoice', avoirId), note: `Avoir n° ${a.ref}` } });
  await query(`CREATE invoice_payment CONTENT $c`, { c: { invoice: recId('invoice', avoirId), amount: m, paid_at: quand, method: 'avoir', applied_to: recId('invoice', factureId), note: `Imputé sur la facture n° ${f.ref}` } });
  await recomputeInvoiceStatus(factureId);
  await recomputeInvoiceStatus(avoirId);
  return { montant: m };
}

/** Recalcule le réglé et l'état d'une facture à partir de ses règlements. */
export async function recomputeInvoiceStatus(invoiceId: string): Promise<{ status: string; paid_total: number }> {
  const id = recId('invoice', invoiceId);
  const inv = (await query<any>(`SELECT total_ttc, kind, status FROM ONLY $id`, { id })) as any;
  if (!inv) throw new Error('Facture introuvable');
  // Un brouillon, une pro forma ou un document annulé ne se règlent pas.
  if (['draft', 'proforma', 'cancelled'].includes(inv.status)) return { status: inv.status, paid_total: 0 };
  const [som] = await query<any>(`SELECT math::sum(amount) AS total FROM invoice_payment WHERE invoice = $id GROUP ALL`, { id });
  const paid_total = r2(Number(som?.total ?? 0));
  const total = r2(Number(inv.total_ttc ?? 0));
  const status = inv.status === 'cancelled' ? 'cancelled' : paid_total <= 0 ? 'unpaid' : paid_total + 0.005 >= total ? 'paid' : 'partial';
  await query(`UPDATE $id SET status = $s, paid_total = $p`, { id, s: status, p: paid_total });
  return { status, paid_total };
}

export async function addPayment(invoiceId: string, p: { amount: number; paid_at?: Date; method?: string; reference?: string; note?: string }): Promise<string> {
  const amount = r2(Number(p.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Montant invalide.');
  const rows = await query<any>(`CREATE invoice_payment CONTENT $c`, {
    c: {
      invoice: recId('invoice', invoiceId), amount, paid_at: p.paid_at ?? new Date(),
      method: PAYMENT_METHODS.includes(p.method ?? '') ? p.method : 'virement',
      reference: p.reference?.trim() || undefined, note: p.note?.trim() || undefined
    }
  });
  await recomputeInvoiceStatus(invoiceId);
  return String(rows[0].id).replace(/^invoice_payment:/, '');
}

export async function deletePayment(paymentId: string): Promise<void> {
  const p = (await query<any>(`SELECT invoice, amount, credit_note, applied_to FROM ONLY $id`, { id: recId('invoice_payment', paymentId) })) as any;
  if (!p) return;
  await query(`DELETE $id`, { id: recId('invoice_payment', paymentId) });
  await recomputeInvoiceStatus(String(p.invoice).replace(/^invoice:/, ''));
  // Une imputation d'avoir se retire des deux côtés.
  const miroir = p.credit_note ?? p.applied_to;
  if (miroir) {
    const autre = String(miroir).replace(/^invoice:/, '');
    const cible = p.credit_note ? 'applied_to' : 'credit_note';
    // query() rend les identifiants en « invoice:id » : on repasse par recId pour comparer à un record.
    const ici = recId('invoice', String(p.invoice).replace(/^invoice:/, ''));
    await query(`DELETE invoice_payment WHERE invoice = $m AND ${cible} = $i AND amount = $a`, { m: recId('invoice', autre), i: ici, a: p.amount });
    await recomputeInvoiceStatus(autre);
  }
}

/* ————————————————————— Création manuelle (facture ou avoir) ————————————————————— */

export type StatutFacture = 'draft' | 'proforma' | 'unpaid' | 'partial' | 'paid' | 'cancelled';

export interface ManualInvoiceInput {
  kind: 'invoice' | 'credit_note';
  customerId?: string;
  /** Client professionnel facturé (personne morale). */
  clientId?: string;
  bill_to: { name: string; email?: string; address_1?: string; postcode?: string; city?: string; country?: string; vat_number?: string; siret?: string; contact_name?: string };
  /** Les prix des lignes sont saisis HT ou TTC ; le document s'imprime dans le même sens. */
  price_mode?: 'ttc' | 'ht';
  lines: { description: string; qty: number; unit_price: number; vat_rate?: number; book?: string; isbn?: string }[];
  vat_rate?: number; // taux de base (défaut des lignes sans taux)
  intro?: string;
  notes?: string;
  issued_at?: Date;
  /** Frais de port, saisis dans le sens des prix du document (HT ou TTC), à leur propre TVA (20 %). */
  shipping?: number;
  shipping_vat_rate?: number;
}

/** Lignes et totaux d'un document, à partir de ce qu'a saisi l'opérateur. */
async function preparerDocument(input: ManualInvoiceInput) {
  const base = input.vat_rate != null ? input.vat_rate : (await getCompany()).vat_rate;
  const ht = input.price_mode === 'ht';
  const lines: InvoiceLine[] = input.lines
    .filter((l) => l.description.trim() && l.qty > 0)
    .map((l) => {
      const vat = l.vat_rate != null ? l.vat_rate : base;
      // En mode HT le prix saisi est HT et le TTC en découle ; en mode TTC, l'inverse.
      const unit_ht = ht ? l.unit_price : l.unit_price / (1 + vat / 100);
      const unit_ttc = ht ? l.unit_price * (1 + vat / 100) : l.unit_price;
      return {
        description: l.description.trim(), qty: l.qty, vat_rate: vat,
        unit_price_ht: r2(unit_ht), unit_price_ttc: r2(unit_ttc),
        // Le total de ligne se calcule sur le prix saisi, pour que le PDF tombe juste dans son sens.
        line_total_ttc: ht ? r2(l.qty * unit_ht * (1 + vat / 100)) : r2(l.qty * l.unit_price),
        book: l.book || undefined, isbn: l.isbn || undefined
      };
    });
  const totals = computeTotals(lines, ht ? 'ht' : 'ttc');
  // Le port s'ajoute aux totaux, à son taux (le transport est à 20 %, pas à 5,5).
  const portTaux = input.shipping_vat_rate ?? 20;
  const portHT = input.shipping && input.shipping > 0 ? r2(ht ? input.shipping : input.shipping / (1 + portTaux / 100)) : 0;
  if (portHT) {
    totals.subtotal_ht = r2(totals.subtotal_ht + portHT);
    totals.total_ttc = r2(totals.total_ttc + portHT * (1 + portTaux / 100));
    totals.tax_total = r2(totals.total_ttc - totals.subtotal_ht);
  }
  return {
    kind: input.kind,
    shipping_ht: portHT || undefined, shipping_vat_rate: portHT ? portTaux : undefined,
    customer: input.customerId ? recId('user', input.customerId) : undefined,
    client: input.clientId ? recId('client', input.clientId) : undefined,
    bill_to: input.bill_to, lines, vat_rate: base, ...totals, price_mode: ht ? 'ht' : 'ttc',
    intro: input.intro || undefined, notes: input.notes || undefined,
    issued_at: input.issued_at ?? new Date()
  };
}

/** Un document naît en BROUILLON : modifiable, sans numéro ; il s'émet ensuite. */
export async function createManualInvoice(input: ManualInvoiceInput): Promise<string> {
  const doc = await preparerDocument(input);
  const rows = await query<any>(`CREATE invoice CONTENT $c`, {
    c: { ...doc, year: doc.issued_at.getFullYear(), number: 0, ref: `BR-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, status: 'draft' }
  });
  return String(rows[0].id).replace(/^invoice:/, '');
}

/** Un brouillon se réécrit entièrement ; un document émis ne se modifie plus. */
export async function updateDraft(id: string, input: ManualInvoiceInput): Promise<void> {
  const inv = (await query<any>(`SELECT status FROM ONLY $id`, { id: recId('invoice', id) })) as any;
  if (!inv) throw new Error('Document introuvable');
  if (inv.status !== 'draft') throw new Error('Seul un brouillon se modifie.');
  const doc = await preparerDocument(input);
  await query(`UPDATE $id MERGE $c`, { id: recId('invoice', id), c: { ...doc, year: doc.issued_at.getFullYear() } });
}

/**
 * Émission : le brouillon (ou la pro forma validée) reçoit son numéro dans la
 * séquence légale et devient une facture à encaisser. Même document.
 */
export async function emettreFacture(id: string, date?: Date): Promise<{ ref: string }> {
  const inv = (await query<any>(`SELECT status, ref, kind, issued_at FROM ONLY $id`, { id: recId('invoice', id) })) as any;
  if (!inv) throw new Error('Document introuvable');
  if (!['draft', 'proforma'].includes(inv.status)) throw new Error('Ce document est déjà émis.');
  const quand = date ?? new Date();
  const { number, ref } = await nextInvoiceRef(quand.getFullYear(), 'invoice');
  await query(`UPDATE $id MERGE $c`, {
    id: recId('invoice', id),
    c: { year: quand.getFullYear(), number, ref, status: 'unpaid', issued_at: quand, proforma_ref: inv.status === 'proforma' ? inv.ref : undefined, validation_token: undefined }
  });
  await recomputeInvoiceStatus(id);
  await synchroniserVentesFacture(id); // une facture émise avec des lignes du catalogue compte dans les ventes
  return { ref };
}

/** Pro forma : le brouillon reçoit un numéro PRO-…, sans valeur comptable, pour accord du client. */
export async function passerProforma(id: string): Promise<{ ref: string }> {
  const inv = (await query<any>(`SELECT status, kind FROM ONLY $id`, { id: recId('invoice', id) })) as any;
  if (!inv) throw new Error('Document introuvable');
  if (inv.status !== 'draft') throw new Error('Seul un brouillon passe en pro forma.');
  if (inv.kind !== 'invoice') throw new Error('Un avoir ne se met pas en pro forma.');
  const quand = new Date();
  const { number, ref } = await nextInvoiceRef(quand.getFullYear(), 'proforma');
  await query(`UPDATE $id MERGE $c`, { id: recId('invoice', id), c: { year: quand.getFullYear(), number, ref, status: 'proforma', issued_at: quand } });
  return { ref };
}

/** Une pro forma pas encore validée peut redevenir brouillon, pour être corrigée. */
export async function retourBrouillon(id: string): Promise<void> {
  const inv = (await query<any>(`SELECT status, validated_at, ref FROM ONLY $id`, { id: recId('invoice', id) })) as any;
  if (!inv || inv.status !== 'proforma') throw new Error('Seule une pro forma revient en brouillon.');
  if (inv.validated_at) throw new Error('Cette pro forma a été validée par le client : émettez-la.');
  await query(`UPDATE $id MERGE $c`, { id: recId('invoice', id), c: { status: 'draft', proforma_ref: inv.ref, ref: `BR-${Date.now().toString(36)}`, number: 0, validation_token: undefined, sent_at: undefined } });
  await synchroniserVentesFacture(id); // plus émise : plus de relevé
}

/** Annulation : jamais d'un document réglé, même en partie. */
export async function annulerFacture(id: string): Promise<void> {
  const inv = (await query<any>(`SELECT status, paid_total FROM ONLY $id`, { id: recId('invoice', id) })) as any;
  if (!inv) throw new Error('Document introuvable');
  if (Number(inv.paid_total ?? 0) > 0) throw new Error('Des règlements sont enregistrés : retirez-les avant d’annuler, ou faites un avoir.');
  await query(`UPDATE $id SET status = 'cancelled'`, { id: recId('invoice', id) });
  await synchroniserVentesFacture(id); // retire son relevé de ventes
}

/* ————————————————————— Lecture ————————————————————— */

const INV_FIELDS = `
  meta::id(id) AS id, ref, kind, year, number, bill_to, lines, vat_rate, price_mode, intro, status, paid_total, due_at,
  subtotal_ht, tax_total, total_ttc, notes, issued_at, order.number AS order_number,
  IF client != NONE THEN meta::id(client) ELSE NONE END AS client_id, client.name AS client_name,
  IF customer != NONE THEN meta::id(customer) ELSE NONE END AS customer_id,
  shipping_ht, shipping_vat_rate, imported_from, external_ref, document.key AS document_key, document.filename AS document_name,
  sent_at, sent_to, validated_at, validation_token, proforma_ref
`;

export async function getInvoice(id: string) {
  const rows = await query<any>(`SELECT ${INV_FIELDS} FROM invoice WHERE id = $id LIMIT 1`, {
    id: recId('invoice', id)
  });
  const inv = rows[0];
  if (!inv) return null;
  inv.vat_breakdown = vatBreakdown(inv.lines ?? [], inv.price_mode === 'ht' ? 'ht' : 'ttc');
  // Les frais de port s'ajoutent à la ventilation, à leur taux (20 % sauf réglage).
  if (inv.shipping_ht) {
    const taux = Number(inv.shipping_vat_rate ?? 20);
    const port = { rate: taux, base_ht: r2(inv.shipping_ht), tax: r2(inv.shipping_ht * taux / 100) };
    const e = inv.vat_breakdown.find((b: any) => b.rate === taux);
    if (e) { e.base_ht = r2(e.base_ht + port.base_ht); e.tax = r2(e.tax + port.tax); } else inv.vat_breakdown.push(port);
  }
  return inv;
}

export async function getInvoiceIdForOrder(orderId: string): Promise<string | null> {
  const rows = await query<any>(`SELECT meta::id(id) AS id FROM invoice WHERE order = $o LIMIT 1`, {
    o: recId('order', orderId)
  });
  return rows[0]?.id ?? null;
}

export interface FiltreFactures {
  q?: string; kind?: string; status?: string; from?: string; to?: string;
  /** Un client professionnel, ou un compte particulier. */
  clientId?: string; customerId?: string;
  sort?: 'date_desc' | 'date_asc' | 'total_desc' | 'total_asc' | 'ref' | 'client';
  limit?: number; offset?: number;
  /** Une sélection explicite (actions groupées) : prime sur le reste du filtre. */
  ids?: string[];
}

const TRI: Record<NonNullable<FiltreFactures['sort']>, string> = {
  date_desc: 'issued_at DESC', date_asc: 'issued_at ASC', total_desc: 'total_ttc DESC', total_asc: 'total_ttc ASC', ref: 'ref ASC', client: 'name ASC'
};

function whereFactures(opts: FiltreFactures) {
  const where: string[] = [];
  const vars: Record<string, unknown> = {};
  if (opts.ids?.length) { where.push('id IN $ids'); vars.ids = opts.ids.map((i) => recId('invoice', i)); }
  if (opts.kind) { where.push('kind = $kind'); vars.kind = opts.kind; }
  // « À encaisser » : les factures (pas les avoirs) qui ne sont pas soldées.
  if (opts.status === 'due') where.push("kind = 'invoice' AND status IN ['unpaid','partial']");
  else if (opts.status) { where.push('status = $status'); vars.status = opts.status; }
  if (opts.clientId) { where.push('client = $client'); vars.client = recId('client', opts.clientId); }
  if (opts.customerId) { where.push('customer = $customer'); vars.customer = recId('user', opts.customerId); }
  if (opts.from) { where.push('issued_at >= $from'); vars.from = new Date(`${opts.from}T00:00:00Z`); }
  if (opts.to) { where.push('issued_at <= $to'); vars.to = new Date(`${opts.to}T23:59:59Z`); }
  if (opts.q && opts.q.trim()) {
    vars.q = opts.q.trim().toLowerCase();
    where.push('(string::lowercase(ref) CONTAINS $q OR string::lowercase(bill_to.name ?? "") CONTAINS $q)');
  }
  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', vars };
}

const LISTE_CHAMPS = `meta::id(id) AS id, ref, kind, bill_to.name AS name, subtotal_ht, tax_total, total_ttc, status, paid_total, issued_at, due_at,
  order.number AS order_number, imported_from, price_mode, IF client != NONE THEN meta::id(client) ELSE NONE END AS client_id`;

export async function listInvoices(opts: FiltreFactures = {}) {
  const { whereSql, vars } = whereFactures(opts);
  const rows = await query<any>(
    `SELECT ${LISTE_CHAMPS} FROM invoice ${whereSql} ORDER BY ${TRI[opts.sort ?? 'date_desc']} LIMIT $limit START $start`,
    { ...vars, limit: opts.limit ?? 50, start: opts.offset ?? 0 }
  );
  const count = await query<any>(`SELECT count() AS n FROM invoice ${whereSql} GROUP ALL`, vars);
  return { invoices: rows, total: count[0]?.n ?? 0 };
}

/** Toutes les lignes d'un filtre (ou d'une sélection), pour l'export. */
export async function exportInvoices(opts: FiltreFactures = {}) {
  const { whereSql, vars } = whereFactures(opts);
  return query<any>(`SELECT ${LISTE_CHAMPS}, bill_to, sent_at FROM invoice ${whereSql} ORDER BY ${TRI[opts.sort ?? 'date_desc']} LIMIT 20000`, vars);
}

/* ————————————————————— PDF (pdf-lib) ————————————————————— */

const fmtEur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
/** Coupe un paragraphe en lignes qui tiennent dans la largeur donnée. */
function wrapText(s: string, font: any, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of s.split(/\r?\n/)) {
    let ligne = '';
    for (const mot of para.split(' ')) {
      const essai = ligne ? `${ligne} ${mot}` : mot;
      if (font.widthOfTextAtSize(essai, size) > width && ligne) { out.push(ligne); ligne = mot; } else ligne = essai;
    }
    out.push(ligne);
  }
  return out;
}
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
  const isProforma = inv.status === 'proforma';
  const isDraft = inv.status === 'draft';

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
  text(isDraft ? 'BROUILLON' : isCredit ? 'AVOIR' : isProforma ? 'FACTURE PRO FORMA' : 'FACTURE', W - M, M + 6, { size: isProforma ? 16 : 20, bold: true, right: W - M });
  text(isDraft ? 'Sans numéro — document non émis' : `N° ${inv.ref}`, W - M, M + 26, { size: isDraft ? 9 : 11, bold: !isDraft, right: W - M, color: isDraft ? grey : ink });
  text(`Date : ${fmtDate(inv.issued_at)}`, W - M, M + 42, { size: 9, color: grey, right: W - M });
  if (inv.order_number) text(`Commande n° ${inv.order_number}`, W - M, M + 55, { size: 9, color: grey, right: W - M });

  // — Facturé à —
  y = Math.max(y, M + 70) + 22;
  text('Facturé à', M, y, { size: 8, bold: true, color: grey }); y += 14;
  const bt = inv.bill_to ?? {};
  text(bt.name || 'Client', M, y, { size: 10, bold: true }); y += 13;
  for (const l of [bt.contact_name ? `À l’attention de ${bt.contact_name}` : '', bt.address_1, [bt.postcode, bt.city].filter(Boolean).join(' '), bt.country, bt.email,
    bt.vat_number ? `TVA ${bt.vat_number}` : '', bt.siret ? `SIRET ${bt.siret}` : ''].filter(Boolean)) {
    text(String(l), M, y, { size: 9, color: grey }); y += 12;
  }

  // — Objet / texte d'introduction —
  if (inv.intro) {
    y += 16;
    for (const l of wrapText(String(inv.intro), font, 9, W - 2 * M)) { text(l, M, y, { size: 9 }); y += 12; }
  }

  // — Tableau des lignes : en mode HT, prix unitaire HT, montant HT et taux de TVA ;
  //   en mode TTC, prix et total TTC. —
  const modeHT = inv.price_mode === 'ht';
  y += 18;
  const colTot = W - M;
  // En mode HT, une colonne TVA s'intercale : les autres reculent d'autant pour que rien ne se chevauche.
  const colTva = modeHT ? W - M - 100 : 0;
  const colPU = modeHT ? W - M - 190 : W - M - 120;
  const colQty = modeHT ? W - M - 270 : W - M - 210;
  text('Désignation', M, y, { size: 8, bold: true, color: grey });
  text('Qté', colQty, y, { size: 8, bold: true, color: grey, right: colQty + 30 });
  text(modeHT ? 'P.U. HT' : 'P.U. TTC', colPU, y, { size: 8, bold: true, color: grey, right: colPU + 70 });
  if (modeHT) text('TVA', colTva, y, { size: 8, bold: true, color: grey, right: colTva + 30 });
  text(modeHT ? 'Montant HT' : 'Total TTC', colTot, y, { size: 8, bold: true, color: grey, right: colTot });
  y += 6; hline(y); y += 14;

  const maxDesc = modeHT ? 50 : 58;
  for (const l of (inv.lines ?? []) as InvoiceLine[]) {
    let desc = l.description || '';
    if (desc.length > maxDesc) desc = desc.slice(0, maxDesc - 1) + '…';
    const unitHt = l.unit_price_ht ?? l.unit_price_ttc / (1 + (l.vat_rate ?? 0) / 100);
    text(desc, M, y, { size: 9 });
    text(String(l.qty), colQty, y, { size: 9, right: colQty + 30 });
    text(fmtEur(modeHT ? unitHt : l.unit_price_ttc), colPU, y, { size: 9, right: colPU + 70 });
    if (modeHT) text(`${String(l.vat_rate ?? inv.vat_rate).replace('.', ',')} %`, colTva, y, { size: 9, right: colTva + 30 });
    text(fmtEur(modeHT ? r2(l.qty * unitHt) : l.line_total_ttc), colTot, y, { size: 9, right: colTot });
    y += 15;
  }
  y += 2; hline(y); y += 16;

  // — Totaux (droite), avec ventilation TVA par taux —
  const sign = isCredit ? -1 : 1;
  const breakdown = vatBreakdown((inv.lines ?? []) as InvoiceLine[], inv.price_mode === 'ht' ? 'ht' : 'ttc');
  const totRows: [string, string, boolean][] = [
    ...(inv.shipping_ht ? [[`Total HT lignes`, fmtEur(sign * r2(inv.subtotal_ht - inv.shipping_ht)), false] as [string, string, boolean], [`Frais de port HT`, fmtEur(sign * inv.shipping_ht), false] as [string, string, boolean]] : []),
    ['Total HT', fmtEur(sign * inv.subtotal_ht), false],
    ...breakdown.map(
      (b) => [`TVA ${String(b.rate).replace('.', ',')} %`, fmtEur(sign * b.tax), false] as [string, string, boolean]
    ),
    ['Total TTC', fmtEur(sign * inv.total_ttc), true]
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
    isProforma ? 'Facture pro forma : document sans valeur comptable, émis pour accord. La facture définitive suit votre validation.' : '',
    isCredit ? '' : 'TVA acquittée sur les encaissements. Pas d’escompte pour paiement anticipé.'
  ].filter(Boolean) as string[];
  page.drawLine({ start: { x: M, y: fy + 8 }, end: { x: W - M, y: fy + 8 }, thickness: 0.7, color: rgb(0.85, 0.85, 0.85) });
  for (const l of footBits) {
    page.drawText(l, { x: M, y: fy, size: 7.5, font, color: grey });
    fy -= 11;
  }

  return doc.save();
}
