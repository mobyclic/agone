/**
 * Droits d'auteur — moteur de calcul + CRUD.
 *
 * Modèle : un `royalty_contract` par livre × contributeur (× rôle) porte un barème
 * PAR PALIERS (droits progressifs sur le cumul des ventes), une base (PPHT/PPTTC/net)
 * et un à-valoir. Les ventes arrivent par CANAL (web, BLDD, …) via des `sales_report`
 * (+ `sales_line`). La reddition (`royalty_statement`) agrège par auteur × période.
 */
import { query, recId } from './surreal';
import { getSetting, setSetting } from './site';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ── Canaux ────────────────────────────────────────────────────
export async function ensureChannels() {
  const existing = await query<any>(`SELECT code FROM sales_channel`);
  const codes = new Set(existing.map((c) => c.code));
  // Les canaux couvrent les deux origines de ventes : les commandes du site
  // (order.channel) et les relevés du distributeur.
  const defaults = [
    { code: 'web', name: 'Vente directe (site)', sort: 0, physical_via_bldd: true },
    { code: 'bldd', name: 'Les Belles Lettres (distribution)', sort: 1, physical_via_bldd: false },
    { code: 'comptoir', name: 'Comptoir & rencontres', sort: 2, physical_via_bldd: false },
    { code: 'vpc', name: 'Vente par correspondance', sort: 3, physical_via_bldd: true },
    { code: 'sortie_editeur', name: 'Sortie éditeur', sort: 4, physical_via_bldd: false }
  ];
  for (const d of defaults) if (!codes.has(d.code)) await query(`CREATE sales_channel CONTENT $d`, { d });
}
export async function listChannels() {
  return query<any>(`SELECT id, code, name, sort, physical_via_bldd FROM sales_channel ORDER BY sort ASC`);
}

// ── Réglages ──────────────────────────────────────────────────
export interface ReglagesDroits {
  /** Part des ventes de l'exercice retenue en provision sur retours (%). */
  provision_rate: number;
  /** En deçà, le net n'est pas payé mais reporté sur l'exercice suivant (€). */
  threshold: number;
}
const REGLAGES_DEFAUT: ReglagesDroits = { provision_rate: 15, threshold: 100 };

export async function getReglagesDroits(): Promise<ReglagesDroits> {
  const v = ((await getSetting('royalties')) ?? {}) as Record<string, unknown>;
  const n = (x: unknown, d: number) => (Number.isFinite(Number(x)) ? Number(x) : d);
  return {
    provision_rate: n(v.provision_rate, REGLAGES_DEFAUT.provision_rate),
    threshold: n(v.threshold, REGLAGES_DEFAUT.threshold)
  };
}

export async function setReglagesDroits(r: ReglagesDroits) {
  await setSetting('royalties', {
    provision_rate: Math.min(100, Math.max(0, Number(r.provision_rate) || 0)),
    threshold: Math.max(0, Number(r.threshold) || 0)
  });
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
  const rows = await query<any>(`SELECT id, title, slug, returns_provision_rate FROM book WHERE id = $id LIMIT 1`, { id: recId('book', bookId) });
  return rows[0] ?? null;
}

/** Couverture contractuelle du catalogue : livres ayant ≥1 contributeur, avec nb de contrats. */
export async function contractCoverage(opts: { q?: string; limit?: number } = {}) {
  const vars: Record<string, unknown> = { limit: opts.limit ?? 100 };
  let where = 'array::len(->contributed_by) > 0';
  if (opts.q && opts.q.trim()) { vars.q = opts.q.trim().toLowerCase(); where += ' AND string::lowercase(title) CONTAINS $q'; }
  const books = await query<any>(
    `SELECT id, title, slug,
        array::len(->contributed_by[WHERE role = 'author']) AS author_count,
        array::len(->contributed_by[WHERE role = 'editor']) AS editor_count,
        array::len(->contributed_by[WHERE role != 'author' AND role != 'editor']) AS contributor_count
       FROM book WHERE ${where} ORDER BY title ASC LIMIT $limit`, vars);
  // Contrats par livre + statut (active | draft | ended).
  const counts = await query<any>(`SELECT book, status, count() AS n FROM royalty_contract GROUP BY book, status`);
  const totalByBook = new Map<string, number>();
  const activeByBook = new Map<string, number>();
  for (const c of counts) {
    if (!c.book) continue;
    const k = String(c.book);
    totalByBook.set(k, (totalByBook.get(k) ?? 0) + (c.n ?? 0));
    if (c.status === 'active') activeByBook.set(k, (activeByBook.get(k) ?? 0) + (c.n ?? 0));
  }
  return books.map((b) => ({
    ...b,
    contract_total: totalByBook.get(String(b.id)) ?? 0,
    contract_active: activeByBook.get(String(b.id)) ?? 0
  }));
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

/**
 * Ventes d'un livre sur une borne temporelle, PAR FORMAT : unités vendues,
 * retournées, et recette réellement encaissée (HT). `gross_price` est le prix
 * unitaire TTC réellement payé quand la source le fournit — indispensable au
 * numérique, dont le contrat calcule les droits sur « le prix de vente hors
 * taxes payé par le public », et non sur le prix catalogue.
 */
async function ventesParFormat(
  bookId: string,
  formats: string[],
  bound: { before?: Date; from?: Date; to?: Date }
): Promise<Map<string, { sold: number; returned: number; revenue_ttc: number; priced_units: number }>> {
  const cond: string[] = ['book = $book', 'format IN $formats'];
  const vars: Record<string, unknown> = { book: recId('book', bookId), formats };
  if (bound.before) { cond.push('report.period_end < $before'); vars.before = bound.before; }
  if (bound.from) { cond.push('report.period_end >= $from'); vars.from = bound.from; }
  if (bound.to) { cond.push('report.period_end <= $to'); vars.to = bound.to; }
  const rows = await query<any>(
    `SELECT format,
        math::sum(units_sold) AS sold,
        math::sum(units_returned) AS returned,
        math::sum(IF gross_price != NONE THEN (units_sold - units_returned) * gross_price ELSE 0 END) AS revenue_ttc,
        math::sum(IF gross_price != NONE THEN units_sold - units_returned ELSE 0 END) AS priced_units
       FROM sales_line WHERE ${cond.join(' AND ')} GROUP BY format`,
    vars
  );
  const out = new Map<string, { sold: number; returned: number; revenue_ttc: number; priced_units: number }>();
  for (const r of rows) {
    out.set(r.format, {
      sold: r.sold ?? 0, returned: r.returned ?? 0,
      revenue_ttc: r.revenue_ttc ?? 0, priced_units: r.priced_units ?? 0
    });
  }
  return out;
}

const totalUnites = (m: Map<string, { sold: number; returned: number }>) => {
  let sold = 0, returned = 0;
  for (const v of m.values()) { sold += v.sold; returned += v.returned; }
  return { sold, returned, net: sold - returned };
};

export interface StatementLine {
  contract: string; book: string; book_title: string; role: string; format?: string;
  units: number; units_sold: number; units_returned: number; units_provision: number; units_released: number;
  base_amount: number; rate: number; gross: number; advance_applied: number; net: number;
}

/** Provision sur retours applicable à un livre (% des ventes de l'exercice). */
async function tauxProvision(bookId: string, defaut: number): Promise<number> {
  const rows = await query<any>(`SELECT returns_provision_rate AS r FROM $id`, { id: recId('book', bookId) });
  const r = rows[0]?.r;
  return Number.isFinite(Number(r)) ? Number(r) : defaut;
}

/** Provision retenue à l'exercice PRÉCÉDENT pour ce contrat — reprise cet exercice. */
async function provisionPrecedente(contractId: string, periodStart: Date): Promise<number> {
  const rows = await query<any>(
    `SELECT lines FROM royalty_statement
       WHERE period_end < $s AND array::len(lines[WHERE contract = $c]) > 0
       ORDER BY period_end DESC LIMIT 1`,
    { s: periodStart, c: contractId }
  );
  const ligne = (rows[0]?.lines ?? []).find((l: any) => String(l.contract) === contractId);
  return Number(ligne?.units_provision ?? 0);
}

/** Report à nouveau : solde non payé (trop faible ou négatif) de l'exercice précédent. */
async function reportPrecedent(authorId: string, periodStart: Date): Promise<number> {
  const rows = await query<any>(
    `SELECT carry_out FROM royalty_statement
       WHERE author = $a AND period_end < $s AND status != 'draft'
       ORDER BY period_end DESC LIMIT 1`,
    { a: recId('author', authorId), s: periodStart }
  );
  return Number(rows[0]?.carry_out ?? 0);
}

/**
 * Calcule la reddition d'un auteur sur une période (sans persister).
 *
 * Suit les contrats Agone : assiette = prix public HT du catalogue pour le papier,
 * prix réellement payé HT pour le numérique ; paliers progressifs sur le CUMUL des
 * ventes ; provision sur retours retenue puis reprise l'exercice suivant ;
 * à-valoir amorti ; report à nouveau et seuil de paiement.
 */
export async function computeStatementForAuthor(authorId: string, periodStart: Date, periodEnd: Date) {
  const reglages = await getReglagesDroits();
  const contracts = await query<any>(
    `SELECT id, book, book.title AS book_title, book.price_paper AS price_paper, book.price_ebook AS price_ebook,
        book.vat_rate AS vat_rate, role, tiers, scope, base, net_rate, advance, advance_recouped
      FROM royalty_contract WHERE author = $a AND status = 'active'`,
    { a: recId('author', authorId) }
  );
  const lines: StatementLine[] = [];
  let gross_total = 0, advance_total = 0, net_total = 0;

  for (const c of contracts) {
    const bookId = String(c.book).replace(/^book:/, '');
    const contractId = String(c.id);
    const formats = FORMATS_FOR[c.scope] ?? FORMATS_FOR.all;
    const vat = c.vat_rate ?? 5.5;

    const periode = await ventesParFormat(bookId, formats, { from: periodStart, to: periodEnd });
    const anterieur = await ventesParFormat(bookId, formats, { before: periodStart });
    const { sold, returned } = totalUnites(periode);
    const prior = totalUnites(anterieur).net;

    // Provision : retenue sur les ventes PHYSIQUES de l'exercice (un fichier
    // numérique ne revient pas), reprise de celle du précédent.
    const taux = await tauxProvision(bookId, reglages.provision_rate);
    const soldPhysique = [...periode.entries()]
      .filter(([f]) => f !== 'ebook')
      .reduce((acc, [, v]) => acc + v.sold, 0);
    const units_provision = Math.round((soldPhysique * taux) / 100);
    const units_released = await provisionPrecedente(contractId, periodStart);
    const units = sold - returned - units_provision + units_released;
    if (sold === 0 && returned === 0 && units_released === 0) continue;

    // Assiette : prix public HT (papier) ou prix réellement payé HT (numérique).
    const pricedRevenue = [...periode.entries()]
      .filter(([f]) => f === 'ebook')
      .reduce((acc, [, v]) => acc + v.revenue_ttc, 0);
    const pricedUnits = [...periode.entries()]
      .filter(([f]) => f === 'ebook')
      .reduce((acc, [, v]) => acc + v.priced_units, 0);
    const baseUnit =
      // Pleine précision ici : arrondir l'assiette unitaire au centime avant de la
      // multiplier par les ventes décale le brut de quelques centimes. La ligne de
      // reddition affiche l'assiette arrondie (base_amount), le calcul ne l'est pas.
      c.scope === 'ebook' && pricedUnits > 0
        ? pricedRevenue / pricedUnits / (1 + vat / 100)
        : baseUnitPrice({ price_paper: c.price_paper, price_ebook: c.price_ebook, vat_rate: vat }, c.scope, c.base, c.net_rate ?? 60);

    // Redevance : à paliers sur le cumul ; un solde négatif reste négatif (dette).
    const { gross, effRate } =
      units >= 0
        ? tieredRoyalty(prior, units, c.tiers ?? [], baseUnit)
        : (() => {
            const g = tieredRoyalty(Math.max(0, prior + units), -units, c.tiers ?? [], baseUnit);
            return { gross: -g.gross, effRate: g.effRate };
          })();

    const outstanding = Math.max(0, (c.advance ?? 0) - (c.advance_recouped ?? 0));
    const advance_applied = gross > 0 ? r2(Math.min(gross, outstanding)) : 0;
    const net = r2(gross - advance_applied);
    lines.push({
      contract: contractId, book: bookId, book_title: c.book_title, role: c.role, format: c.scope,
      units, units_sold: sold, units_returned: returned, units_provision, units_released,
      base_amount: r2(baseUnit), rate: effRate, gross, advance_applied, net
    });
    gross_total += gross; advance_total += advance_applied; net_total += net;
  }

  // Report à nouveau et seuil de paiement (100 € chez Agone).
  const carry_in = await reportPrecedent(authorId, periodStart);
  const total_due = r2(net_total + carry_in);
  const payable = total_due >= reglages.threshold ? total_due : 0;
  const carry_out = r2(total_due - payable);

  return {
    lines,
    gross_total: r2(gross_total),
    advance_applied: r2(advance_total),
    carry_in: r2(carry_in),
    total_due,
    payable: r2(payable),
    carry_out
  };
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
        lines: res.lines, gross_total: res.gross_total, advance_applied: res.advance_applied,
        carry_in: res.carry_in, total_due: res.total_due, payable: res.payable, carry_out: res.carry_out
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
        status, gross_total, advance_applied, carry_in, total_due, payable, carry_out
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

/** Relevés de droits d'un auteur (pour la fiche auteur), les plus récents d'abord. */
export async function statementsForAuthor(authorId: string) {
  return query<any>(
    `SELECT meta::id(id) AS id, period_start, period_end, status, gross_total, advance_applied, total_due, paid_at
       FROM royalty_statement WHERE author = $a ORDER BY period_start DESC`,
    { a: recId('author', authorId) }
  );
}

/**
 * Change le statut d'une reddition et, à l'ÉMISSION, écrit l'amortissement de
 * l'à-valoir sur les contrats concernés — sans quoi le même à-valoir se déduirait
 * de chaque exercice et l'auteur ne serait jamais payé. `advance_posted` rend
 * l'écriture idempotente ; un retour en brouillon la reprend.
 */
export async function setStatementStatus(id: string, status: 'draft' | 'issued' | 'paid') {
  const sid = recId('royalty_statement', id);
  const st = (await query<any>(`SELECT lines, advance_posted FROM $id`, { id: sid }))[0];
  if (!st) return;
  const lignes: any[] = st.lines ?? [];
  const poste = st.advance_posted === true;

  if ((status === 'issued' || status === 'paid') && !poste) {
    for (const l of lignes) {
      const montant = Number(l.advance_applied ?? 0);
      if (!montant || !l.contract) continue;
      await query(`UPDATE $id SET advance_recouped = (advance_recouped ?? 0) + $m`, {
        id: recId('royalty_contract', String(l.contract).replace(/^royalty_contract:/, '')), m: montant
      });
    }
  } else if (status === 'draft' && poste) {
    for (const l of lignes) {
      const montant = Number(l.advance_applied ?? 0);
      if (!montant || !l.contract) continue;
      await query(`UPDATE $id SET advance_recouped = math::max([0, (advance_recouped ?? 0) - $m])`, {
        id: recId('royalty_contract', String(l.contract).replace(/^royalty_contract:/, '')), m: montant
      });
    }
  }

  const stamp = status === 'issued' ? ', issued_at = time::now()' : status === 'paid' ? ', paid_at = time::now()' : '';
  await query(`UPDATE $id SET status = $s, advance_posted = $p${stamp}`, {
    id: sid, s: status, p: status !== 'draft'
  });
}

/** Périodes de reddition existantes (pour le sélecteur). */
export async function listPeriods() {
  return query<any>(
    `SELECT period_start, period_end, count() AS n, math::sum(total_due) AS total
       FROM royalty_statement GROUP BY period_start, period_end ORDER BY period_start DESC`
  );
}

// ── Ventes directes : relevés produits depuis les commandes ────────────────

/** Statuts de commande qui valent vente (même définition que les statistiques). */
const COMMANDES_PAYEES = ['completed', 'paid', 'processing', 'sent_to_bl'];
/** Format de commande → format de ligne de vente. */
const FORMAT_VENTE: Record<string, string> = { papier: 'paper', epub: 'ebook', souscription: 'souscription' };

/**
 * Produit les relevés de ventes des canaux directs (site, comptoir, VPC, sortie
 * éditeur) à partir des commandes déjà en base, un relevé par canal.
 *
 * Sans cela, les droits ignoraient purement et simplement les ventes du site : le
 * moteur ne lit que `sales_line`, qu'aucun code n'alimentait. Les commandes
 * remboursées de la période comptent en retours. Idempotent : les relevés
 * automatiques (label « auto ») du même canal et de la même période sont refaits.
 */
export async function genererRelevesDepuisCommandes(periodStart: Date, periodEnd: Date) {
  await ensureChannels();
  const canaux = await listChannels();
  const parCode = new Map<string, string>();
  for (const c of canaux) parCode.set(c.code, String(c.id).replace(/^sales_channel:/, ''));

  const viaBldd = new Map<string, boolean>();
  for (const c of canaux) viaBldd.set(c.code, c.physical_via_bldd === true);

  const resultats: { canal: string; lignes: number; unites: number; note?: string }[] = [];
  for (const code of ['web', 'comptoir', 'vpc', 'sortie_editeur']) {
    const channelId = parCode.get(code);
    if (!channelId) continue;
    // Papier du site et de la VPC : expédié et facturé par Les Belles Lettres, donc
    // déjà compté dans le relevé BLDD. On ne retient ici que le numérique, que le
    // distributeur ne voit jamais.
    const formatsRetenus = viaBldd.get(code) ? ['epub'] : ['papier', 'epub', 'souscription'];

    // Ventes et retours de la période, par livre et par format.
    const agrege = async (statuts: string[]) =>
      query<any>(
        `SELECT out AS book, format, math::sum(qty) AS q, math::sum(line_total) AS ca
           FROM contains
          WHERE in.status IN $statuts AND in.channel = $code AND format IN $formats
            AND (in.paid_at ?? in.created_at) >= $s AND (in.paid_at ?? in.created_at) <= $e
          GROUP BY book, format`,
        { statuts, code, formats: formatsRetenus, s: periodStart, e: periodEnd }
      );
    const ventes = await agrege(COMMANDES_PAYEES);
    const retours = await agrege(['refunded']);
    if (!ventes.length && !retours.length) continue;

    const cle = (b: unknown, f: unknown) => `${String(b)}|${String(f)}`;
    const lignes = new Map<string, { book: string; format: string; sold: number; returned: number; ca: number }>();
    for (const v of ventes) {
      lignes.set(cle(v.book, v.format), {
        book: String(v.book), format: FORMAT_VENTE[v.format] ?? 'paper',
        sold: v.q ?? 0, returned: 0, ca: v.ca ?? 0
      });
    }
    for (const r of retours) {
      const k = cle(r.book, r.format);
      const l = lignes.get(k);
      if (l) l.returned += r.q ?? 0;
      else lignes.set(k, { book: String(r.book), format: FORMAT_VENTE[r.format] ?? 'paper', sold: 0, returned: r.q ?? 0, ca: 0 });
    }

    // Remplace le relevé automatique existant de cette période (idempotence).
    const anciens = await query<any>(
      `SELECT id FROM sales_report WHERE channel = $c AND period_start = $s AND period_end = $e AND label = 'auto'`,
      { c: recId('sales_channel', channelId), s: periodStart, e: periodEnd }
    );
    for (const a of anciens) await deleteReport(String(a.id).replace(/^sales_report:/, ''));

    const reportId = await createReport({
      channelId, period_start: periodStart.toISOString(), period_end: periodEnd.toISOString(), label: 'auto'
    });
    const rows = [...lignes.values()].map((l) => ({
      report: recId('sales_report', reportId),
      book: recId('book', l.book.replace(/^book:/, '')),
      format: l.format,
      units_sold: Math.round(l.sold),
      units_returned: Math.round(l.returned),
      units_free: 0,
      // Prix unitaire TTC réellement encaissé (remises et promotions comprises).
      gross_price: l.sold > 0 ? r2(l.ca / l.sold) : undefined
    }));
    for (let i = 0; i < rows.length; i += 100) await query(`INSERT INTO sales_line $d`, { d: rows.slice(i, i + 100) });
    resultats.push({
      canal: code,
      lignes: rows.length,
      unites: rows.reduce((n, r) => n + r.units_sold - r.units_returned, 0),
      note: viaBldd.get(code) ? 'numérique seul — le papier est facturé par BLDD' : undefined
    });
  }
  return resultats;
}

/** Provision sur retours propre à un livre (null = défaut global). */
export async function setProvisionLivre(bookId: string, rate: number | null) {
  const v = rate == null || !Number.isFinite(rate) ? undefined : Math.min(100, Math.max(0, rate));
  await query(`UPDATE $id SET returns_provision_rate = $v`, { id: recId('book', bookId), v });
}

/** Provision appliquée à un livre, et si elle lui est propre (pour l'affichage). */
export async function getProvisionLivre(bookId: string): Promise<{ rate: number; propre: boolean }> {
  const reglages = await getReglagesDroits();
  const rows = await query<any>(`SELECT returns_provision_rate AS r FROM $id`, { id: recId('book', bookId) });
  const r = rows[0]?.r;
  return Number.isFinite(Number(r)) ? { rate: Number(r), propre: true } : { rate: reglages.provision_rate, propre: false };
}

// ── Ventes du distributeur : import de l'état BLDD ─────────────────────────

/**
 * Importe l'« État des ventes et retours » de l'extranet BLDD sur une période,
 * dans un relevé du canal « bldd ». Lecture seule côté distributeur.
 *
 * Le relevé porte, par ISBN : exemplaires vendus et retournés, chiffre au prix
 * public HT, et montant réellement facturé par BLDD (après remise libraire) —
 * cette dernière colonne servira aux contrats calculés sur le net encaissé.
 * Idempotent : le relevé automatique de la même période est refait.
 */
export async function importVentesBldd(periodStart: Date, periodEnd: Date) {
  const { fetchBlSales } = await import('./belleslettres');
  await ensureChannels();
  const canal = (await listChannels()).find((c: any) => c.code === 'bldd');
  if (!canal) throw new Error('Canal « bldd » introuvable.');
  const channelId = String(canal.id).replace(/^sales_channel:/, '');

  const ventes = await fetchBlSales(periodStart, periodEnd);
  const utiles = ventes.filter((v) => v.units_sold || v.units_returned);

  // Résolution par ISBN (papier ou numérique).
  const books = await query<any>(`SELECT id, isbn_paper, isbn_ebook FROM book WHERE isbn_paper != NONE OR isbn_ebook != NONE`);
  // L'ISBN dit aussi le format : un EAN numérique vaut une vente d'ebook.
  const parIsbn = new Map<string, { id: string; format: string }>();
  for (const b of books) {
    if (b.isbn_paper) parIsbn.set(String(b.isbn_paper).replace(/\D/g, ''), { id: String(b.id), format: 'paper' });
    if (b.isbn_ebook) parIsbn.set(String(b.isbn_ebook).replace(/\D/g, ''), { id: String(b.id), format: 'ebook' });
  }

  const anciens = await query<any>(
    `SELECT id FROM sales_report WHERE channel = $c AND period_start = $s AND period_end = $e AND label = 'auto'`,
    { c: recId('sales_channel', channelId), s: periodStart, e: periodEnd }
  );
  for (const a of anciens) await deleteReport(String(a.id).replace(/^sales_report:/, ''));

  const reportId = await createReport({
    channelId, period_start: periodStart.toISOString(), period_end: periodEnd.toISOString(), label: 'auto'
  });

  const inconnus: string[] = [];
  const rows = utiles.map((v) => {
    const trouve = parIsbn.get(v.isbn);
    if (!trouve) inconnus.push(`${v.isbn} — ${v.title}`);
    return {
      report: recId('sales_report', reportId),
      book: trouve ? recId('book', trouve.id.replace(/^book:/, '')) : undefined,
      isbn: v.isbn,
      format: trouve?.format ?? 'paper',
      units_sold: v.units_sold,
      units_returned: v.units_returned,
      units_free: 0,
      gross_ht: r2(v.net_ht),
      net_receipt: r2(v.invoiced_ht)
    };
  });
  for (let i = 0; i < rows.length; i += 100) await query(`INSERT INTO sales_line $d`, { d: rows.slice(i, i + 100) });

  return {
    lignes: rows.length,
    vendus: utiles.reduce((n, v) => n + v.units_sold, 0),
    retours: utiles.reduce((n, v) => n + v.units_returned, 0),
    prix_public_ht: r2(utiles.reduce((n, v) => n + v.net_ht, 0)),
    facture_ht: r2(utiles.reduce((n, v) => n + v.invoiced_ht, 0)),
    inconnus
  };
}
