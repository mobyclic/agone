/**
 * Droits d'auteur — moteur de calcul + CRUD.
 *
 * Modèle : un `royalty_contract` par livre × contributeur (× rôle) porte un barème
 * PAR PALIERS (droits progressifs sur le cumul des ventes), une base (PPHT/PPTTC/net)
 * et un à-valoir. Les ventes arrivent par CANAL (web, BLDD, …) via des `sales_report`
 * (+ `sales_line`). La reddition (`royalty_statement`) agrège par auteur × période.
 */
import { query, recId } from './surreal';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ── Canaux ────────────────────────────────────────────────────
export async function ensureChannels() {
  const existing = await query<any>(`SELECT code FROM sales_channel`);
  const codes = new Set(existing.map((c) => c.code));
  const defaults = [
    { code: 'web', name: 'Vente directe (site)', sort: 0 },
    { code: 'bldd', name: 'Les Belles Lettres (distribution)', sort: 1 }
  ];
  for (const d of defaults) if (!codes.has(d.code)) await query(`CREATE sales_channel CONTENT $d`, { d });
}
export async function listChannels() {
  return query<any>(`SELECT id, code, name, sort FROM sales_channel ORDER BY sort ASC`);
}

// ── Contrats ──────────────────────────────────────────────────
export interface Tier { up_to?: number; rate: number }
export interface ContractInput {
  bookId: string; authorId: string; role: string;
  tiers: Tier[]; scope: string; base: string; net_rate?: number;
  advance?: number; advance_recouped?: number; status?: string; notes?: string;
}

/** Contrats d'un livre (avec nom d'auteur), indexés par authorId+role. */
export async function contractsForBook(bookId: string) {
  return query<any>(
    `SELECT id, author, author.full_name AS author_name, role, tiers, scope, base, net_rate,
        advance, advance_recouped, status, notes
      FROM royalty_contract WHERE book = $b ORDER BY role`,
    { b: recId('book', bookId) }
  );
}

export async function upsertContract(d: ContractInput) {
  const tiers = (d.tiers ?? [])
    .filter((t) => t && Number.isFinite(t.rate))
    .map((t) => ({ up_to: t.up_to != null && t.up_to > 0 ? Math.round(t.up_to) : undefined, rate: Number(t.rate) }));
  const fields = {
    book: recId('book', d.bookId), author: recId('author', d.authorId), role: d.role || 'author',
    tiers, scope: d.scope || 'all', base: d.base || 'ppht', net_rate: d.net_rate ?? 60,
    advance: d.advance ?? 0, advance_recouped: d.advance_recouped ?? 0,
    status: d.status || 'active', notes: d.notes || undefined
  };
  // upsert par (book, author, role)
  const existing = await query<any>(
    `SELECT id FROM royalty_contract WHERE book = $b AND author = $a AND role = $r LIMIT 1`,
    { b: fields.book, a: fields.author, r: fields.role }
  );
  if (existing[0]) {
    await query(`UPDATE $id CONTENT $c`, { id: recId('royalty_contract', existing[0].id), c: fields });
    return String(existing[0].id);
  }
  const rows = await query<any>(`CREATE royalty_contract CONTENT $c`, { c: fields });
  return String(rows[0].id);
}

export async function deleteContract(id: string) {
  await query(`DELETE $id`, { id: recId('royalty_contract', id) });
}

/** Contributeurs d'un livre avec leur contrat (ou null) — pour l'éditeur de contrats. */
export async function bookContributorsWithContracts(bookId: string) {
  const contributors = await query<any>(
    `SELECT out AS author_id, out.full_name AS author_name, role FROM contributed_by WHERE in = $b ORDER BY role`,
    { b: recId('book', bookId) }
  );
  const contracts = await contractsForBook(bookId);
  const byKey = new Map<string, any>();
  for (const c of contracts) byKey.set(`${String(c.author)}|${c.role}`, c);
  return contributors.map((ct: any) => ({
    author_id: String(ct.author_id), author_name: ct.author_name, role: ct.role,
    contract: byKey.get(`${String(ct.author_id)}|${ct.role}`) ?? null
  }));
}

export async function getBookLite(bookId: string) {
  const rows = await query<any>(`SELECT id, title, slug FROM book WHERE id = $id LIMIT 1`, { id: recId('book', bookId) });
  return rows[0] ?? null;
}

/** Couverture contractuelle du catalogue : livres ayant ≥1 contributeur, avec nb de contrats. */
export async function contractCoverage(opts: { q?: string; limit?: number } = {}) {
  const vars: Record<string, unknown> = { limit: opts.limit ?? 100 };
  let where = 'array::len(->contributed_by) > 0';
  if (opts.q && opts.q.trim()) { vars.q = opts.q.trim().toLowerCase(); where += ' AND string::lowercase(title) CONTAINS $q'; }
  const books = await query<any>(
    `SELECT id, title, slug, array::len(->contributed_by) AS contributor_count
       FROM book WHERE ${where} ORDER BY title ASC LIMIT $limit`, vars);
  const counts = await query<any>(`SELECT book, count() AS n FROM royalty_contract GROUP BY book`);
  const byBook = new Map<string, number>();
  for (const c of counts) if (c.book) byBook.set(String(c.book), c.n ?? 0);
  return books.map((b) => ({ ...b, contract_count: byBook.get(String(b.id)) ?? 0 }));
}

// ── Relevés de ventes ─────────────────────────────────────────
export async function listReports() {
  const reports = await query<any>(
    `SELECT id, channel.name AS channel_name, channel.code AS channel_code, period_start, period_end, label, imported_at
       FROM sales_report ORDER BY period_start DESC`);
  const counts = await query<any>(`SELECT report, count() AS n FROM sales_line GROUP BY report`);
  const byReport = new Map<string, number>();
  for (const c of counts) if (c.report) byReport.set(String(c.report), c.n ?? 0);
  return reports.map((r) => ({ ...r, line_count: byReport.get(String(r.id)) ?? 0 }));
}

export async function createReport(d: { channelId: string; period_start: string; period_end: string; label?: string }) {
  const rows = await query<any>(`CREATE sales_report CONTENT $c`, {
    c: {
      channel: recId('sales_channel', d.channelId),
      period_start: new Date(d.period_start), period_end: new Date(d.period_end),
      label: d.label || undefined
    }
  });
  return String(rows[0].id);
}

export async function deleteReport(id: string) {
  await query(`DELETE sales_line WHERE report = $id`, { id: recId('sales_report', id) });
  await query(`DELETE $id`, { id: recId('sales_report', id) });
}

/** Ajoute des lignes de vente à un relevé ; résout le livre par ISBN. */
export async function addSalesLines(reportId: string, lines: { isbn?: string; format?: string; units_sold: number; units_returned?: number; units_free?: number; gross_price?: number }[]) {
  // index ISBN → book
  const books = await query<any>(`SELECT id, isbn_paper, isbn_ebook FROM book WHERE isbn_paper != NONE OR isbn_ebook != NONE`);
  const byIsbn = new Map<string, string>();
  for (const b of books) { if (b.isbn_paper) byIsbn.set(String(b.isbn_paper).replace(/\D/g, ''), b.id); if (b.isbn_ebook) byIsbn.set(String(b.isbn_ebook).replace(/\D/g, ''), b.id); }
  const rows = lines.filter((l) => (l.units_sold ?? 0) || (l.units_returned ?? 0)).map((l) => {
    const isbn = (l.isbn ?? '').replace(/\D/g, '');
    const bookId = isbn ? byIsbn.get(isbn) : undefined;
    return {
      report: recId('sales_report', reportId),
      book: bookId ? recId('book', bookId) : undefined,
      isbn: isbn || undefined, format: l.format || 'paper',
      units_sold: Math.round(l.units_sold ?? 0), units_returned: Math.round(l.units_returned ?? 0),
      units_free: Math.round(l.units_free ?? 0), gross_price: l.gross_price ?? undefined
    };
  });
  for (let i = 0; i < rows.length; i += 100) await query(`INSERT INTO sales_line $d`, { d: rows.slice(i, i + 100) });
  return rows.length;
}

// ── Moteur de calcul ──────────────────────────────────────────
const FORMATS_FOR: Record<string, string[]> = {
  paper: ['paper', 'souscription'],
  ebook: ['ebook'],
  all: ['paper', 'ebook', 'souscription']
};

/** Prix de base unitaire selon la base contractuelle. */
function baseUnitPrice(book: any, scope: string, base: string, netRate: number): number {
  const price = scope === 'ebook' ? book.price_ebook ?? book.price_paper ?? 0 : book.price_paper ?? 0;
  const vat = book.vat_rate ?? 5.5;
  if (base === 'ppttc') return price;
  if (base === 'net') return price * (netRate / 100);
  return price / (1 + vat / 100); // ppht
}

/** Redevance à paliers sur [prior, prior+units] (cumul). */
export function tieredRoyalty(prior: number, units: number, tiers: Tier[], baseUnit: number): { gross: number; effRate: number } {
  if (units <= 0 || !tiers?.length || baseUnit <= 0) return { gross: 0, effRate: 0 };
  const ts = tiers.map((t) => ({ up_to: t.up_to != null ? t.up_to : Infinity, rate: t.rate })).sort((a, b) => a.up_to - b.up_to);
  let remaining = units, cursor = prior, gross = 0;
  for (const t of ts) {
    if (remaining <= 0) break;
    if (cursor >= t.up_to) continue;
    const take = Math.min(remaining, t.up_to - cursor);
    gross += take * baseUnit * (t.rate / 100);
    cursor += take; remaining -= take;
  }
  if (remaining > 0) gross += remaining * baseUnit * (ts[ts.length - 1].rate / 100); // au-delà du dernier plafond
  return { gross: r2(gross), effRate: r2((gross / (units * baseUnit)) * 100) };
}

/** Unités nettes (vendues - retournées) d'un livre pour des formats, sur une borne temporelle. */
async function netUnits(bookId: string, formats: string[], bound: { before?: Date; from?: Date; to?: Date }): Promise<number> {
  const cond: string[] = ['book = $book', 'format IN $formats'];
  const vars: Record<string, unknown> = { book: recId('book', bookId), formats };
  if (bound.before) { cond.push('report.period_end < $before'); vars.before = bound.before; }
  if (bound.from) { cond.push('report.period_end >= $from'); vars.from = bound.from; }
  if (bound.to) { cond.push('report.period_end <= $to'); vars.to = bound.to; }
  const rows = await query<any>(
    `SELECT math::sum(units_sold) AS s, math::sum(units_returned) AS r
       FROM sales_line WHERE ${cond.join(' AND ')} GROUP ALL`, vars
  );
  return (rows[0]?.s ?? 0) - (rows[0]?.r ?? 0);
}

export interface StatementLine {
  contract: string; book: string; book_title: string; role: string;
  units: number; base_amount: number; rate: number; gross: number; advance_applied: number; net: number;
}

/** Calcule la reddition d'un auteur sur une période (sans persister). */
export async function computeStatementForAuthor(authorId: string, periodStart: Date, periodEnd: Date) {
  const contracts = await query<any>(
    `SELECT id, book, book.title AS book_title, book.price_paper AS price_paper, book.price_ebook AS price_ebook,
        book.vat_rate AS vat_rate, role, tiers, scope, base, net_rate, advance, advance_recouped
      FROM royalty_contract WHERE author = $a AND status = 'active'`,
    { a: recId('author', authorId) }
  );
  const lines: StatementLine[] = [];
  let gross_total = 0, advance_total = 0, net_total = 0;
  for (const c of contracts) {
    const bookId = String(c.book);
    const formats = FORMATS_FOR[c.scope] ?? FORMATS_FOR.all;
    const book = { price_paper: c.price_paper, price_ebook: c.price_ebook, vat_rate: c.vat_rate };
    const baseUnit = baseUnitPrice(book, c.scope, c.base, c.net_rate ?? 60);
    const prior = await netUnits(bookId, formats, { before: periodStart });
    const period = await netUnits(bookId, formats, { from: periodStart, to: periodEnd });
    if (period <= 0) continue;
    const { gross, effRate } = tieredRoyalty(prior, period, c.tiers ?? [], baseUnit);
    const outstanding = Math.max(0, (c.advance ?? 0) - (c.advance_recouped ?? 0));
    const advance_applied = r2(Math.min(gross, outstanding));
    const net = r2(gross - advance_applied);
    lines.push({
      contract: String(c.id), book: bookId, book_title: c.book_title, role: c.role,
      units: period, base_amount: r2(baseUnit), rate: effRate, gross, advance_applied, net
    });
    gross_total += gross; advance_total += advance_applied; net_total += net;
  }
  return { lines, gross_total: r2(gross_total), advance_applied: r2(advance_total), total_due: r2(net_total) };
}

/** Génère (draft) les redditions de tous les auteurs ayant des ventes sur la période. */
export async function generateStatements(periodStart: Date, periodEnd: Date): Promise<number> {
  // auteurs concernés = ceux ayant un contrat actif dont le livre a des ventes sur la période
  const authors = await query<any>(`SELECT author FROM royalty_contract WHERE status = 'active' GROUP BY author`);
  // purge les redditions draft existantes de cette période (idempotence)
  await query(`DELETE royalty_statement WHERE period_start = $s AND period_end = $e AND status = 'draft'`,
    { s: periodStart, e: periodEnd });
  let created = 0;
  for (const a of authors) {
    const authorId = String(a.author).replace(/^author:/, '');
    const res = await computeStatementForAuthor(authorId, periodStart, periodEnd);
    if (!res.lines.length) continue;
    // ne pas écraser une reddition déjà émise/payée
    const already = await query<any>(
      `SELECT id FROM royalty_statement WHERE author = $a AND period_start = $s AND period_end = $e AND status != 'draft' LIMIT 1`,
      { a: recId('author', authorId), s: periodStart, e: periodEnd });
    if (already[0]) continue;
    await query(`CREATE royalty_statement CONTENT $c`, {
      c: {
        author: recId('author', authorId), period_start: periodStart, period_end: periodEnd, status: 'draft',
        lines: res.lines, gross_total: res.gross_total, advance_applied: res.advance_applied, total_due: res.total_due
      }
    });
    created++;
  }
  return created;
}

export async function listStatements(periodStart?: Date, periodEnd?: Date) {
  const where = periodStart && periodEnd ? 'WHERE period_start = $s AND period_end = $e' : '';
  return query<any>(
    `SELECT id, author.full_name AS author_name, author.slug AS author_slug, period_start, period_end,
        status, gross_total, advance_applied, total_due
      FROM royalty_statement ${where} ORDER BY total_due DESC`,
    periodStart && periodEnd ? { s: periodStart, e: periodEnd } : {}
  );
}

export async function getStatement(id: string) {
  const rows = await query<any>(
    `SELECT *, author.full_name AS author_name, author.slug AS author_slug FROM royalty_statement WHERE id = $id LIMIT 1`,
    { id: recId('royalty_statement', id) });
  return rows[0] ?? null;
}

export async function setStatementStatus(id: string, status: 'draft' | 'issued' | 'paid') {
  const stamp = status === 'issued' ? ', issued_at = time::now()' : status === 'paid' ? ', paid_at = time::now()' : '';
  await query(`UPDATE $id SET status = $s${stamp}`, { id: recId('royalty_statement', id), s: status });
}

/** Périodes de reddition existantes (pour le sélecteur). */
export async function listPeriods() {
  return query<any>(
    `SELECT period_start, period_end, count() AS n, math::sum(total_due) AS total
       FROM royalty_statement GROUP BY period_start, period_end ORDER BY period_start DESC`
  );
}
