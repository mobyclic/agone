/**
 * Cessions de droits — droits VENDUS à un éditeur étranger (Agone encaisse) ou
 * droits ACQUIS auprès d'un ayant droit étranger (Agone paie).
 *
 * Les deux sens se suivent de la même façon : un contrat (langue, territoire,
 * durée), un à-valoir, des taux, et des échéances. Seules les sommes RÉGLÉES
 * comptent : une redevance annoncée mais non encaissée n'entre pas dans la
 * reddition de l'auteur.
 */
import { query, recId } from './surreal';

export interface DealInput {
  id?: string;
  bookId: string;
  direction: 'out' | 'in';
  counterparty: string;
  country?: string;
  language?: string;
  territory?: string;
  kind?: string;
  signed_at?: string;
  term_years?: number;
  expires_at?: string;
  publish_deadline?: string;
  advance?: number;
  currency?: string;
  rate_paper?: number;
  rate_paper_base?: string;
  rate_ebook?: number;
  rate_ebook_base?: string;
  author_share?: number;
  status?: string;
  notes?: string;
}

const DEAL_FIELDS = `meta::id(id) AS id, book, book.title AS book_title, book.slug AS book_slug,
  direction, counterparty, country, language, territory, kind, signed_at, term_years, expires_at,
  publish_deadline, advance, currency, rate_paper, rate_paper_base, rate_ebook, rate_ebook_base,
  author_share, status, notes`;

/** Toutes les cessions, la plus récente d'abord. */
export async function listDeals(opts: { direction?: string; bookId?: string } = {}) {
  const cond: string[] = [];
  const vars: Record<string, unknown> = {};
  if (opts.direction) { cond.push('direction = $d'); vars.d = opts.direction; }
  if (opts.bookId) { cond.push('book = $b'); vars.b = recId('book', opts.bookId); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const deals = await query<any>(
    `SELECT ${DEAL_FIELDS} FROM rights_deal ${where} ORDER BY signed_at DESC`, vars
  );
  if (!deals.length) return [];
  // Sommes réglées et restant dues, par cession.
  const paiements = await query<any>(
    `SELECT deal, settled_at, amount FROM rights_payment WHERE deal != NONE`
  );
  const regle = new Map<string, number>(), attendu = new Map<string, number>();
  for (const p of paiements) {
    const k = String(p.deal);
    const cible = p.settled_at ? regle : attendu;
    cible.set(k, (cible.get(k) ?? 0) + Number(p.amount ?? 0));
  }
  return deals.map((d) => ({
    ...d,
    encaisse: regle.get(`rights_deal:${d.id}`) ?? 0,
    en_attente: attendu.get(`rights_deal:${d.id}`) ?? 0
  }));
}

export const dealsForBook = (bookId: string) => listDeals({ bookId });

export async function getDeal(id: string) {
  const rows = await query<any>(`SELECT ${DEAL_FIELDS} FROM rights_deal WHERE id = $id LIMIT 1`, {
    id: recId('rights_deal', id)
  });
  return rows[0] ?? null;
}

export async function upsertDeal(d: DealInput) {
  const date = (v?: string) => (v ? new Date(v) : undefined);
  const nombre = (v?: number) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
  const champs = {
    book: recId('book', d.bookId),
    direction: d.direction === 'in' ? 'in' : 'out',
    counterparty: d.counterparty.trim(),
    country: d.country || undefined,
    language: d.language || undefined,
    territory: d.territory || undefined,
    kind: d.kind || 'translation',
    signed_at: date(d.signed_at),
    term_years: nombre(d.term_years),
    expires_at: date(d.expires_at),
    publish_deadline: date(d.publish_deadline),
    advance: nombre(d.advance) ?? 0,
    currency: (d.currency || 'EUR').toUpperCase(),
    rate_paper: nombre(d.rate_paper),
    rate_paper_base: d.rate_paper_base === 'net' ? 'net' : 'retail',
    rate_ebook: nombre(d.rate_ebook),
    rate_ebook_base: d.rate_ebook_base === 'retail' ? 'retail' : 'net',
    author_share: Math.min(100, Math.max(0, nombre(d.author_share) ?? 50)),
    status: d.status || 'active',
    notes: d.notes || undefined
  };
  if (d.id) {
    await query(`UPDATE $id CONTENT $c`, { id: recId('rights_deal', d.id), c: champs });
    return d.id;
  }
  const rows = await query<any>(`CREATE rights_deal CONTENT $c`, { c: champs });
  const id = String(rows[0].id).replace(/^rights_deal:/, '');
  // L'à-valoir est la première échéance : on la crée avec la cession.
  if (champs.advance > 0) {
    await addPayment(id, { kind: 'advance', amount: champs.advance, currency: champs.currency,
      due_on: d.signed_at, notes: 'À-valoir à la signature' });
  }
  return id;
}

export async function deleteDeal(id: string) {
  const d = recId('rights_deal', id);
  await query(`DELETE rights_payment WHERE deal = $d`, { d });
  await query(`DELETE $d`, { d });
}

// ── Échéances ──────────────────────────────────────────────────────────────

export async function listPayments(dealId: string) {
  return query<any>(
    `SELECT meta::id(id) AS id, kind, amount, currency, due_on, settled_at, period_start, period_end, notes
       FROM rights_payment WHERE deal = $d ORDER BY due_on`,
    { d: recId('rights_deal', dealId) }
  );
}

export async function addPayment(
  dealId: string,
  p: { kind?: string; amount: number; currency?: string; due_on?: string; settled_at?: string;
       period_start?: string; period_end?: string; notes?: string }
) {
  const date = (v?: string) => (v ? new Date(v) : undefined);
  await query(`CREATE rights_payment CONTENT $c`, {
    c: {
      deal: recId('rights_deal', dealId),
      kind: p.kind || 'royalty',
      amount: Number(p.amount) || 0,
      currency: (p.currency || 'EUR').toUpperCase(),
      due_on: date(p.due_on),
      settled_at: date(p.settled_at),
      period_start: date(p.period_start),
      period_end: date(p.period_end),
      notes: p.notes || undefined
    }
  });
}

/** Pointe une échéance comme réglée (ou la dépointe). */
export async function setPaymentSettled(id: string, settled: boolean, date?: string) {
  await query(`UPDATE $id SET settled_at = $d`, {
    id: recId('rights_payment', id),
    d: settled ? (date ? new Date(date) : new Date()) : undefined
  });
}

export const deletePayment = (id: string) => query(`DELETE $id`, { id: recId('rights_payment', id) });

// ── Ce que les cessions rapportent aux auteurs ─────────────────────────────

export interface ProduitCession {
  deal: string;
  libelle: string;
  encaisse: number;
  author_share: number;
  part_auteurs: number;
}

/**
 * Sommes encaissées sur la période au titre des cessions VENDUES d'un livre, et
 * part qui revient à ses auteurs. Une cession acquise (direction « in ») est une
 * dépense : elle n'entre pas ici.
 */
export async function produitsCessions(bookId: string, from: Date, to: Date): Promise<ProduitCession[]> {
  const deals = await query<any>(
    `SELECT meta::id(id) AS id, counterparty, language, kind, author_share, currency
       FROM rights_deal WHERE book = $b AND direction = 'out' AND status != 'draft'`,
    { b: recId('book', bookId) }
  );
  if (!deals.length) return [];
  const out: ProduitCession[] = [];
  for (const d of deals) {
    const lignes = await query<any>(
      `SELECT amount, settled_at FROM rights_payment
        WHERE deal = $d AND settled_at != NONE AND settled_at >= $s AND settled_at <= $e`,
      { d: recId('rights_deal', d.id), s: from, e: to }
    );
    const encaisse = lignes.reduce((n: number, l: any) => n + Number(l.amount ?? 0), 0);
    if (!encaisse) continue;
    const part = Math.min(100, Math.max(0, Number(d.author_share ?? 50)));
    out.push({
      deal: `rights_deal:${d.id}`,
      libelle: `Cession ${d.language ? `${d.language} — ` : ''}${d.counterparty}`,
      encaisse: Math.round(encaisse * 100) / 100,
      author_share: part,
      part_auteurs: Math.round(encaisse * part) / 100
    });
  }
  return out;
}
