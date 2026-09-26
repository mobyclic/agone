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
  /** Contrat existant à modifier ; absent = nouveau contrat (ou avenant). */
  id?: string;
  bookId: string; authorId: string; role: string;
  tiers: Tier[]; scope: string; base: string; net_rate?: number;
  advance?: number; advance_recouped?: number; status?: string; notes?: string;
  /** Validité : un avenant en cours d'année = un second contrat qui prend la suite. */
  term_start?: string; term_end?: string; tiers_reset?: boolean;
}

/** Contrats d'un livre (avec nom d'auteur), indexés par authorId+role. */
export async function contractsForBook(bookId: string) {
  return query<any>(
    `SELECT id, author, author.full_name AS author_name, role, tiers, tiers_reset, scope, base, net_rate,
        advance, advance_recouped, status, notes, term_start, term_end
      FROM royalty_contract WHERE book = $b ORDER BY role, term_start`,
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
    status: d.status || 'active', notes: d.notes || undefined,
    term_start: d.term_start ? new Date(d.term_start) : undefined,
    term_end: d.term_end ? new Date(d.term_end) : undefined,
    tiers_reset: d.tiers_reset === true
  };
  // Modification d'un contrat désigné, sinon upsert par (livre, auteur, rôle,
  // prise d'effet) : les avenants successifs coexistent au lieu de s'écraser.
  const existing = d.id
    ? [{ id: d.id.replace(/^royalty_contract:/, '') }]
    : await query<any>(
        `SELECT id FROM royalty_contract WHERE book = $b AND author = $a AND role = $r AND term_start = $t LIMIT 1`,
        { b: fields.book, a: fields.author, r: fields.role, t: fields.term_start ?? null }
      );
  if (existing[0]) {
    await query(`UPDATE $id CONTENT $c`, { id: recId('royalty_contract', String(existing[0].id).replace(/^royalty_contract:/, '')), c: fields });
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
  // Plusieurs contrats possibles par contributeur : le contrat d'origine et ses
  // avenants successifs, chacun valable sur sa période.
  const byKey = new Map<string, any[]>();
  for (const c of contracts) {
    const k = `${String(c.author)}|${c.role}`;
    byKey.set(k, [...(byKey.get(k) ?? []), c]);
  }
  return contributors.map((ct: any) => ({
    author_id: String(ct.author_id), author_name: ct.author_name, role: ct.role,
    contracts: byKey.get(`${String(ct.author_id)}|${ct.role}`) ?? []
  }));
}

export async function getBookLite(bookId: string) {
  const rows = await query<any>(`SELECT id, title, slug, returns_provision_rate FROM book WHERE id = $id LIMIT 1`, { id: recId('book', bookId) });
  return rows[0] ?? null;
}

/** Couverture contractuelle du catalogue : livres ayant ≥1 contributeur, avec nb de contrats. */
export async function contractCoverage(opts: { q?: string; limit?: number } = {}) {
  const vars: Record<string, unknown> = { limit: opts.limit ?? 1000 };
  let where = 'array::len(->contributed_by) > 0';
  if (opts.q && opts.q.trim()) { vars.q = opts.q.trim().toLowerCase(); where += ' AND string::lowercase(title) CONTAINS $q'; }
  const books = await query<any>(
    `SELECT id, title, slug, published_at, cover.url AS cover_url,
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
export interface Segment { from: Date; to: Date }
type AgrFormat = { sold: number; returned: number; exported: number; revenue_ttc: number; priced_units: number };
const agrVide = (): AgrFormat => ({ sold: 0, returned: 0, exported: 0, revenue_ttc: 0, priced_units: 0 });

const JOUR = 86_400_000;
/** Nombre de jours communs à deux intervalles (bornes incluses). */
function chevauchement(a: Segment, b: Segment) {
  const debut = Math.max(+a.from, +b.from), fin = Math.min(+a.to, +b.to);
  return fin < debut ? 0 : (fin - debut) / JOUR + 1;
}

/** Répartit des parts fractionnaires en entiers dont la somme est conservée. */
function repartirEntiers(parts: number[]): number[] {
  const total = Math.round(parts.reduce((a, b) => a + b, 0));
  const bas = parts.map((p) => Math.floor(p));
  let reste = total - bas.reduce((a, b) => a + b, 0);
  const ordre = parts.map((p, i) => ({ i, frac: p - Math.floor(p) })).sort((x, y) => y.frac - x.frac);
  for (const o of ordre) { if (reste <= 0) break; bas[o.i]++; reste--; }
  for (let k = ordre.length - 1; k >= 0 && reste < 0; k--) { bas[ordre[k].i]--; reste++; }
  return bas;
}

/**
 * Ventes d'un livre réparties entre plusieurs tranches de temps.
 *
 * Sert aux contrats qui changent en cours d'exercice : chaque tranche reçoit les
 * ventes de sa période. Un relevé à cheval sur un changement (un relevé annuel
 * quand l'avenant prend effet au 1er juillet) est réparti AU PRORATA DES JOURS —
 * approximation signalée dans la reddition, et qui disparaît si les ventes sont
 * relevées mois par mois ou au moins par semestre.
 */
async function ventesParSegments(
  bookId: string, formats: string[], segments: Segment[]
): Promise<{ parSegment: Map<string, AgrFormat>[]; aCheval: boolean }> {
  if (!segments.length) return { parSegment: [], aCheval: false };
  const min = new Date(Math.min(...segments.map((s) => +s.from)));
  const max = new Date(Math.max(...segments.map((s) => +s.to)));
  const rows = await query<any>(
    `SELECT format, units_sold, units_returned, units_export, gross_price,
            report.period_start AS ps, report.period_end AS pe
       FROM sales_line
      WHERE book = $book AND format IN $formats
        AND report.period_end >= $min AND report.period_start <= $max`,
    { book: recId('book', bookId), formats, min, max }
  );

  // Poids de chaque relevé dans chaque tranche, cumulés en flottant…
  const flottant = new Map<string, number[]>();
  const ajoute = (f: string, champ: string, i: number, v: number) => {
    const cle = `${f}|${champ}`;
    let t = flottant.get(cle);
    if (!t) { t = segments.map(() => 0); flottant.set(cle, t); }
    t[i] += v;
  };
  let aCheval = false;
  for (const r of rows) {
    const rapport: Segment = { from: new Date(r.ps), to: new Date(r.pe ?? r.ps) };
    const duree = Math.max(1, (+rapport.to - +rapport.from) / JOUR + 1);
    const f = String(r.format ?? 'paper');
    let tranchesTouchees = 0;
    segments.forEach((seg, i) => {
      const poids = chevauchement(rapport, seg) / duree;
      if (poids <= 0) return;
      if (poids < 0.999) tranchesTouchees++;
      const vendus = Number(r.units_sold ?? 0), rendus = Number(r.units_returned ?? 0);
      ajoute(f, 'sold', i, vendus * poids);
      ajoute(f, 'returned', i, rendus * poids);
      ajoute(f, 'exported', i, Number(r.units_export ?? 0) * poids);
      if (r.gross_price != null) {
        ajoute(f, 'revenue_ttc', i, (vendus - rendus) * Number(r.gross_price) * poids);
        ajoute(f, 'priced_units', i, (vendus - rendus) * poids);
      }
    });
    if (tranchesTouchees > 1) aCheval = true;
  }

  // … puis arrondis en entiers, sans perdre ni inventer d'exemplaire.
  const parSegment = segments.map(() => new Map<string, AgrFormat>());
  for (const [cle, parts] of flottant) {
    const [f, champ] = cle.split('|');
    const valeurs = champ === 'revenue_ttc' ? parts : repartirEntiers(parts);
    valeurs.forEach((v, i) => {
      const m = parSegment[i];
      const a = m.get(f) ?? agrVide();
      (a as any)[champ] = v;
      m.set(f, a);
    });
  }
  return { parSegment, aCheval };
}

/** Portion de l'exercice couverte par un contrat (null s'il n'y était pas en vigueur). */
function segmentContrat(c: { term_start?: string; term_end?: string }, periodStart: Date, periodEnd: Date): Segment | null {
  const debut = c.term_start && new Date(c.term_start) > periodStart ? new Date(c.term_start) : periodStart;
  const fin = c.term_end && new Date(c.term_end) < periodEnd ? new Date(c.term_end) : periodEnd;
  return +fin < +debut ? null : { from: debut, to: fin };
}

/** Jours de l'exercice qu'aucun contrat ne couvre (ventes sans contrat). */
function trousDeCouverture(segments: Segment[], periodStart: Date, periodEnd: Date): Segment[] {
  const tries = [...segments].sort((a, b) => +a.from - +b.from);
  const trous: Segment[] = [];
  let curseur = +periodStart;
  for (const s of tries) {
    if (+s.from > curseur) trous.push({ from: new Date(curseur), to: new Date(+s.from - JOUR) });
    curseur = Math.max(curseur, +s.to + JOUR);
  }
  if (curseur <= +periodEnd) trous.push({ from: new Date(curseur), to: periodEnd });
  return trous;
}

const totalUnites = (m: Map<string, { sold: number; returned: number }>) => {
  let sold = 0, returned = 0;
  for (const v of m.values()) { sold += v.sold; returned += v.returned; }
  return { sold, returned, net: sold - returned };
};

export interface StatementLine {
  contract: string; book: string; book_title: string; role: string; format?: string;
  units: number; units_sold: number; units_returned: number; units_provision: number; units_released: number;
  /** Part des unités retenues vendue hors France (taux contractuel réduit de moitié). */
  units_export: number;
  base_amount: number; rate: number; gross: number; advance_applied: number; net: number;
  /** Portion de l'exercice couverte par ce contrat, quand il n'en couvre qu'une partie. */
  segment_start?: string; segment_end?: string;
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
    `SELECT lines, period_end FROM royalty_statement
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
    `SELECT carry_out, period_end FROM royalty_statement
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
  // Les contrats terminés comptent aussi : ils ont pu être en vigueur une partie
  // de l'exercice, et leur provision sur retours reste à reprendre l'année d'après.
  const contracts = await query<any>(
    `SELECT id, book, book.title AS book_title, book.price_paper AS price_paper, book.price_ebook AS price_ebook,
        book.vat_rate AS vat_rate, role, tiers, tiers_reset, scope, base, net_rate, advance, advance_recouped,
        term_start, term_end
      FROM royalty_contract WHERE author = $a AND status != 'draft'`,
    { a: recId('author', authorId) }
  );

  const lines: StatementLine[] = [];
  const warnings: string[] = [];
  let gross_total = 0, advance_total = 0, net_total = 0;
  const jourFr = (d: Date) => d.toLocaleDateString('fr-FR');

  // Une « série » réunit les contrats successifs d'un même livre, même rôle,
  // même périmètre : c'est là qu'un avenant prend la suite du contrat précédent.
  const series = new Map<string, any[]>();
  for (const c of contracts) {
    const k = `${String(c.book)}|${c.role}|${c.scope}`;
    const l = series.get(k) ?? [];
    l.push(c);
    series.set(k, l);
  }

  for (const liste of series.values()) {
    // Ordre chronologique : un contrat sans date de prise d'effet vient en premier.
    liste.sort((a, b) => (a.term_start ? +new Date(a.term_start) : 0) - (b.term_start ? +new Date(b.term_start) : 0));
    const bookId = String(liste[0].book).replace(/^book:/, '');
    const titre = liste[0].book_title;
    const formats = FORMATS_FOR[liste[0].scope] ?? FORMATS_FOR.all;
    const vat = liste[0].vat_rate ?? 5.5;
    const taux = await tauxProvision(bookId, reglages.provision_rate);

    const segs = liste.map((c) => segmentContrat(c, periodStart, periodEnd));
    const enVigueur = segs.filter((x): x is Segment => x !== null);
    const trous = trousDeCouverture(enVigueur, periodStart, periodEnd);
    const { parSegment, aCheval } = await ventesParSegments(bookId, formats, [...enVigueur, ...trous]);
    if (aCheval) {
      warnings.push(
        `${titre} : un relevé de ventes chevauche un changement de contrat — les exemplaires ont été répartis au prorata des jours. Relever les ventes mois par mois lèverait l'approximation.`
      );
    }

    // Ventes antérieures à l'exercice : elles font avancer les paliers.
    const { parSegment: avant } = await ventesParSegments(bookId, formats, [
      { from: new Date(0), to: new Date(+periodStart - 1) }
    ]);
    let prior = totalUnites(avant[0] ?? new Map()).net;

    let rang = 0;
    for (const [i, c] of liste.entries()) {
      const seg = segs[i];
      const periode = seg ? parSegment[rang++] : new Map<string, AgrFormat>();
      const contractId = String(c.id);
      // Un avenant peut remettre le compteur des paliers à zéro.
      if (c.tiers_reset) prior = 0;

      const { sold, returned } = totalUnites(periode);
      const exportees = [...periode.values()].reduce((n, v) => n + v.exported, 0);

      // Provision : retenue sur les ventes PHYSIQUES de la tranche (un fichier
      // numérique ne revient pas), reprise de celle du précédent exercice.
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
      const { gross: brutPlein, effRate } =
        units >= 0
          ? tieredRoyalty(prior, units, c.tiers ?? [], baseUnit)
          : (() => {
              const g = tieredRoyalty(Math.max(0, prior + units), -units, c.tiers ?? [], baseUnit);
              return { gross: -g.gross, effRate: g.effRate };
            })();

      // Hors France : « le taux applicable sera diminué de cinquante pour cent ».
      // La part exportée suit la même proportion que les unités retenues (la
      // provision sur retours s'applique aussi bien ici qu'ailleurs).
      const netVendu = sold - returned;
      const partExport = netVendu > 0 ? Math.min(1, exportees / netVendu) : 0;
      const unitesExport = r2(units * partExport);
      const abattement = r2(0.5 * unitesExport * baseUnit * (effRate / 100));
      const gross = r2(brutPlein - abattement);

      const outstanding = Math.max(0, (c.advance ?? 0) - (c.advance_recouped ?? 0));
      const advance_applied = gross > 0 ? r2(Math.min(gross, outstanding)) : 0;
      const net = r2(gross - advance_applied);
      // Les paliers continuent de courir d'un avenant à l'autre.
      prior += Math.max(0, units);

      const partiel = seg != null && (+seg.from > +periodStart || +seg.to < +periodEnd);
      lines.push({
        contract: contractId, book: bookId, book_title: titre, role: c.role, format: c.scope,
        units, units_sold: sold, units_returned: returned, units_provision, units_released,
        units_export: unitesExport,
        base_amount: r2(baseUnit), rate: effRate, gross, advance_applied, net,
        segment_start: partiel && seg ? seg.from.toISOString() : undefined,
        segment_end: partiel && seg ? seg.to.toISOString() : undefined
      });
      gross_total += gross; advance_total += advance_applied; net_total += net;
    }

    // Ventes survenues alors qu'aucun contrat n'était en vigueur : rien n'est dû
    // automatiquement, mais il faut le savoir avant d'émettre la reddition.
    trous.forEach((t, j) => {
      const m = parSegment[enVigueur.length + j];
      const { net: n } = totalUnites(m ?? new Map());
      if (n > 0) {
        warnings.push(
          `${titre} : ${n} ex. vendus du ${jourFr(t.from)} au ${jourFr(t.to)} sans contrat en vigueur — aucun droit calculé sur cette période.`
        );
      }
    });
  }

  // Report à nouveau et seuil de paiement (100 € chez Agone).
  const carry_in = await reportPrecedent(authorId, periodStart);
  const total_due = r2(net_total + carry_in);
  const payable = total_due >= reglages.threshold ? total_due : 0;
  const carry_out = r2(total_due - payable);

  return {
    lines,
    warnings,
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
  const authors = await query<any>(`SELECT author FROM royalty_contract WHERE status != 'draft' GROUP BY author`);
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
        lines: res.lines, warnings: res.warnings, gross_total: res.gross_total, advance_applied: res.advance_applied,
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

  // Période sans aucune vente : on ne laisse pas un relevé vide derrière nous.
  if (!utiles.length) return { reportId: '', lignes: 0, vendus: 0, retours: 0, prix_public_ht: 0, facture_ht: 0, inconnus: [] as string[] };

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
    reportId,
    lignes: rows.length,
    vendus: utiles.reduce((n, v) => n + v.units_sold, 0),
    retours: utiles.reduce((n, v) => n + v.units_returned, 0),
    prix_public_ht: r2(utiles.reduce((n, v) => n + v.net_ht, 0)),
    facture_ht: r2(utiles.reduce((n, v) => n + v.invoiced_ht, 0)),
    inconnus
  };
}

// ── Mouvements de stock du distributeur (art. 6 des contrats) ──────────────

/**
 * Relève, mois par mois, les mouvements de stock BLDD de la période et les
 * consolide par livre : stock d'ouverture et de clôture, entrées (fabrication et
 * réassorts), sorties, services de presse, ventes brutes et retours crédités.
 *
 * Douze requêtes pour une année, quel que soit le nombre de titres : la page de
 * stock du distributeur porte toutes ces colonnes pour tout le catalogue. La
 * fiche par titre ne dirait pas plus et coûterait une requête par livre.
 */
export async function importMouvementsBldd(periodStart: Date, periodEnd: Date) {
  const { fetchBlStockMonth } = await import('./belleslettres');

  // Mois couverts par la période, dans l'ordre.
  const mois: { m: number; y: number }[] = [];
  const curseur = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth(), 1));
  while (curseur <= periodEnd) {
    mois.push({ m: curseur.getUTCMonth() + 1, y: curseur.getUTCFullYear() });
    curseur.setUTCMonth(curseur.getUTCMonth() + 1);
  }

  type Cumul = {
    stock_start: number; stock_end: number; entries: number; exits: number;
    free_copies: number; gross_sales: number; returns_credited: number;
  };
  const parEan = new Map<string, Cumul>();
  for (const [i, { m, y }] of mois.entries()) {
    const rows = await fetchBlStockMonth(m, y);
    for (const r of rows) {
      const c = parEan.get(r.ean) ?? { stock_start: 0, stock_end: 0, entries: 0, exits: 0, free_copies: 0, gross_sales: 0, returns_credited: 0 };
      if (i === 0) c.stock_start = r.stock_start; // ouverture = début du premier mois
      c.stock_end = r.stock_end;                  // clôture = fin du dernier mois vu
      c.entries += r.entries;
      c.exits += r.exits;
      c.free_copies += r.free_copies;
      c.gross_sales += r.gross_sales;
      c.returns_credited += r.returns_credited;
      parEan.set(r.ean, c);
    }
  }

  const books = await query<any>(`SELECT meta::id(id) AS id, isbn_paper FROM book WHERE isbn_paper != NONE`);
  const parIsbn = new Map<string, string>();
  for (const b of books) parIsbn.set(String(b.isbn_paper).replace(/\D/g, ''), b.id);

  let enregistres = 0, inconnus = 0;
  for (const [ean, c] of parEan) {
    // Un titre sans mouvement ni stock n'apprend rien : on ne l'enregistre pas.
    if (!c.stock_start && !c.stock_end && !c.entries && !c.exits && !c.free_copies && !c.gross_sales) continue;
    const bookId = parIsbn.get(ean);
    if (!bookId) { inconnus++; continue; }
    const id = recId('book', bookId);
    const ex = await query<any>(
      `SELECT meta::id(id) AS id FROM book_period_stock WHERE book = $b AND period_start = $s AND period_end = $e LIMIT 1`,
      { b: id, s: periodStart, e: periodEnd }
    );
    const contenu = { book: id, period_start: periodStart, period_end: periodEnd, source: 'bldd', ...c };
    if (ex[0]) await query(`UPDATE $id CONTENT $c`, { id: recId('book_period_stock', ex[0].id), c: contenu });
    else await query(`CREATE book_period_stock CONTENT $c`, { c: contenu });
    enregistres++;
  }
  return { mois: mois.length, titres: enregistres, inconnus };
}

/** Mouvements de stock d'un livre sur une période (pour la reddition). */
export async function mouvementsLivre(bookId: string, periodStart: Date, periodEnd: Date) {
  const rows = await query<any>(
    `SELECT stock_start, stock_end, entries, exits, free_copies, gross_sales, returns_credited
       FROM book_period_stock WHERE book = $b AND period_start = $s AND period_end = $e LIMIT 1`,
    { b: recId('book', bookId), s: periodStart, e: periodEnd }
  );
  return rows[0] ?? null;
}

/** Tous les relevés de mouvements d'un livre, du plus récent au plus ancien. */
export async function mouvementsLivreTous(bookId: string) {
  return await query<any>(
    `SELECT period_start, period_end, stock_start, stock_end, entries, exits, free_copies, gross_sales, returns_credited
       FROM book_period_stock WHERE book = $b ORDER BY period_start DESC`,
    { b: recId('book', bookId) }
  );
}

/**
 * Renseigne, sur un relevé BLDD déjà importé, la part des ventes réalisées HORS
 * FRANCE — les contrats y appliquent un taux diminué de moitié.
 *
 * Le distributeur ne donne pas ce découpage : il faut ouvrir le journal des
 * ventes de chaque titre (une requête par livre, quelques minutes pour un
 * exercice complet) et reconnaître les adresses étrangères. D'où une opération
 * à part, lancée à la demande, et non à chaque import.
 */
export async function detaillerExportBldd(reportId: string) {
  const { fetchBlStockMonth, fetchBlSalesDetail } = await import('./belleslettres');
  const rapport = (await query<any>(
    `SELECT period_start, period_end FROM $id`, { id: recId('sales_report', reportId) }
  ))[0];
  if (!rapport) throw new Error('Relevé introuvable.');
  const debut = new Date(rapport.period_start), fin = new Date(rapport.period_end);

  // Le code article du distributeur se lit sur la page de stock (colonne « Code BLDD »).
  const codes = new Map<string, string>();
  for (const r of await fetchBlStockMonth(fin.getUTCMonth() + 1, fin.getUTCFullYear())) {
    if (r.code_bldd) codes.set(r.ean, r.code_bldd);
  }

  const lignes = await query<any>(
    `SELECT meta::id(id) AS id, isbn, units_sold FROM sales_line WHERE report = $r AND units_sold > 0`,
    { r: recId('sales_report', reportId) }
  );
  let traites = 0, avecExport = 0, unitesExport = 0, sansCode = 0;
  for (const l of lignes) {
    const code = codes.get(String(l.isbn ?? '').replace(/\D/g, ''));
    if (!code) { sansCode++; continue; }
    try {
      const detail = await fetchBlSalesDetail(code, debut, fin);
      const hors = detail.filter((d) => d.abroad).reduce((n, d) => n + d.sold - d.returned, 0);
      traites++;
      if (hors > 0) {
        avecExport++;
        unitesExport += hors;
        await query(`UPDATE $id SET units_export = $n`, { id: recId('sales_line', l.id), n: hors });
      }
    } catch { sansCode++; }
    await new Promise((r) => setTimeout(r, 120)); // courtoisie envers l'extranet
  }
  return { traites, avecExport, unitesExport, sansCode };
}

// ── Résultats par exercice ─────────────────────────────────────────────────

export interface ExerciceVentes {
  annee: number;
  vendus: number;
  retours: number;
  net: number;
  export: number;
  ca_ht: number;
  mois_couverts: number;
  complete: boolean;
  canaux: { code: string; nom: string; vendus: number; retours: number }[];
}

/**
 * Ventes relevées, regroupées par exercice (année civile) et par canal.
 *
 * `complete` dit si les douze mois de l'année sont couverts par des relevés ET
 * si l'année est révolue : un exercice incomplet ne peut pas être arrêté, et
 * les chiffres affichés n'y valent qu'à titre indicatif.
 */
async function ventesParExercice(filtre: string, vars: Record<string, unknown>): Promise<ExerciceVentes[]> {
  const lignes = await query<any>(
    `SELECT report.period_start AS ps, report.period_end AS pe,
            report.channel.code AS canal, report.channel.name AS canal_nom,
            units_sold, units_returned, units_export, gross_ht, gross_price
       FROM sales_line WHERE ${filtre}`,
    vars
  );

  const parAnnee = new Map<number, ExerciceVentes & { _mois: Set<number>; _canaux: Map<string, any> }>();
  for (const l of lignes) {
    if (!l.ps) continue;
    const debut = new Date(l.ps), fin = new Date(l.pe ?? l.ps);
    const annee = debut.getUTCFullYear();
    let e = parAnnee.get(annee);
    if (!e) {
      e = {
        annee, vendus: 0, retours: 0, net: 0, export: 0, ca_ht: 0,
        mois_couverts: 0, complete: false, canaux: [],
        _mois: new Set<number>(), _canaux: new Map()
      };
      parAnnee.set(annee, e);
    }
    // Mois couverts par le relevé dont vient la ligne (bornés à l'année).
    const premier = debut.getUTCFullYear() === annee ? debut.getUTCMonth() : 0;
    const dernier = fin.getUTCFullYear() === annee ? fin.getUTCMonth() : 11;
    for (let m = premier; m <= dernier; m++) e._mois.add(m);

    const vendus = Number(l.units_sold ?? 0), retours = Number(l.units_returned ?? 0);
    e.vendus += vendus;
    e.retours += retours;
    e.export += Number(l.units_export ?? 0);
    // BLDD donne le chiffre HT du relevé ; les canaux directs, un prix unitaire.
    e.ca_ht += Number(l.gross_ht ?? 0) || Number(l.gross_price ?? 0) * vendus;

    const code = String(l.canal ?? 'autre');
    const c = e._canaux.get(code) ?? { code, nom: String(l.canal_nom ?? code), vendus: 0, retours: 0 };
    c.vendus += vendus; c.retours += retours;
    e._canaux.set(code, c);
  }

  const anneeCourante = new Date().getUTCFullYear();
  return [...parAnnee.values()]
    .map((e) => {
      const { _mois, _canaux, ...reste } = e;
      return {
        ...reste,
        net: e.vendus - e.retours,
        ca_ht: r2(e.ca_ht),
        mois_couverts: _mois.size,
        complete: _mois.size === 12 && e.annee < anneeCourante,
        canaux: [..._canaux.values()].sort((a, b) => b.vendus - a.vendus)
      };
    })
    .sort((a, b) => b.annee - a.annee);
}

/** Ventes d'un livre, par exercice. */
export const ventesParExerciceLivre = (bookId: string) =>
  ventesParExercice(`book = $b`, { b: recId('book', bookId) });

/** Ventes de tous les livres d'un auteur, par exercice. */
export async function ventesParExerciceAuteur(authorId: string) {
  const livres = await query<any>(
    `SELECT VALUE <-contributed_by<-book FROM ONLY $a`, { a: recId('author', authorId) }
  );
  const ids = (Array.isArray(livres) ? livres.flat() : []).map((b: any) => String(b));
  if (!ids.length) return [];
  return ventesParExercice(`book IN $livres`, { livres: ids.map((i) => recId('book', i.replace(/^book:/, ''))) });
}

/**
 * Couverture des relevés de ventes, exercice par exercice : combien de mois de
 * l'année sont couverts. Avant d'arrêter les comptes, mieux vaut savoir que
 * l'exercice n'est relevé que sur huit mois.
 */
export async function couvertureExercices(annees: number[]): Promise<Record<number, number>> {
  const rapports = await query<any>(`SELECT period_start, period_end FROM sales_report`);
  const parAnnee: Record<number, Set<number>> = {};
  for (const a of annees) parAnnee[a] = new Set<number>();
  for (const r of rapports) {
    if (!r.period_start) continue;
    const debut = new Date(r.period_start), fin = new Date(r.period_end ?? r.period_start);
    for (const a of annees) {
      if (debut.getUTCFullYear() > a || fin.getUTCFullYear() < a) continue;
      const premier = debut.getUTCFullYear() === a ? debut.getUTCMonth() : 0;
      const dernier = fin.getUTCFullYear() === a ? fin.getUTCMonth() : 11;
      for (let m = premier; m <= dernier; m++) parAnnee[a].add(m);
    }
  }
  return Object.fromEntries(annees.map((a) => [a, parAnnee[a].size]));
}
