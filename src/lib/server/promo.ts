/**
 * Codes promo — validation/remise côté panier + CRUD back-office.
 */
import { query, recId } from './surreal';
import type { CartLine } from './cart';
import { appliquerRegle, dansPerimetre, decrireRegle, prixRemise, sansCondition, type RegleRemise, type LigneRemise, type RemiseLigne } from '$lib/promoCalcul';
import { getClub, adhesionActive, regleClub } from './club';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** SET dynamique : valeur vide → NONE ; Date → type::datetime($iso) ; sinon $var. */
function buildSet(fields: Record<string, unknown>): { sql: string; vars: Record<string, unknown> } {
  const parts: string[] = [];
  const vars: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    const empty = v === undefined || v === null || v === '' || (typeof v === 'number' && Number.isNaN(v));
    if (empty) parts.push(`${k} = NONE`);
    else if (v instanceof Date) { vars[k] = v.toISOString(); parts.push(`${k} = type::datetime($${k})`); }
    else { vars[k] = v; parts.push(`${k} = $${k}`); }
  }
  return { sql: parts.join(', '), vars };
}

// ── Validation / remise ───────────────────────────────────────
/**
 * Résultat d'une remise : `auto` = appliquée d'office (promotion automatique ou
 * club) ; `lignes` = part de chaque ligne du panier (affichage, net par livre).
 */
export type PromoResult =
  | { ok: true; code: string; type: 'percent' | 'amount'; value: number; discount: number; description?: string; auto?: boolean; lignes: RemiseLigne[] }
  | { ok: false; error: string };

type Panier = { subtotal: number; lines: CartLine[] };

/** Une ligne promo_code (base) → règle de calcul. */
async function versRegle(p: any): Promise<RegleRemise> {
  const condBooks = (p.condition_books ?? []).map((x: any) => String(x).replace(/^book:/, ''));
  const titres = condBooks.length ? await query<string>(`SELECT VALUE title FROM book WHERE id IN $ids`, { ids: condBooks.map((b: string) => recId('book', b)) }) : [];
  return {
    code: p.code, description: p.description ?? undefined, type: p.type === 'amount' ? 'amount' : 'percent', value: Number(p.value ?? 0),
    scope: ['collection', 'book', 'fond'].includes(p.scope) ? p.scope : 'all',
    books: (p.books ?? []).map((x: any) => String(x)), collections: (p.collections ?? []).map((x: any) => String(x)), fondAns: Number(p.fond_years ?? 2),
    minSubtotal: p.min_subtotal ?? undefined, condition: ['min_qty', 'contains'].includes(p.condition) ? p.condition : 'none',
    conditionQty: p.condition_qty ?? undefined, conditionBooks: condBooks, conditionTitres: titres, maxItems: p.max_items ?? undefined, auto: p.automatic === true
  };
}

/** Lignes du panier enrichies (parution, collections) pour le calcul. */
async function lignesPourCalcul(cart: Panier): Promise<LigneRemise[]> {
  const ids = [...new Set(cart.lines.map((l) => String(l.id).replace(/^book:/, '')))];
  const books = ids.length ? await query<any>(`SELECT meta::id(id) AS id, published_at, primary_collection, collections FROM book WHERE id IN $ids`, { ids: ids.map((x) => recId('book', x)) }) : [];
  const info = new Map<string, any>(books.map((b: any) => [String(b.id), b]));
  return cart.lines.map((l) => {
    const b = info.get(String(l.id).replace(/^book:/, ''));
    return { id: String(l.id), format: l.format, qty: l.qty, unit_price: l.unit_price, line_total: l.line_total, published_at: b?.published_at ?? null,
      collections: [b?.primary_collection, ...(b?.collections ?? [])].filter(Boolean).map((c: any) => String(c)) };
  });
}

/** Garde-fous communs : actif, dates, quota, clients réservés. Renvoie l'erreur ou null. */
function horsJeu(p: any, userId?: string): string | null {
  if (!p.active) return 'Code promo invalide.';
  const now = Date.now();
  if (p.starts_at && new Date(p.starts_at).getTime() > now) return "Ce code n'est pas encore actif.";
  if (p.ends_at && new Date(p.ends_at).getTime() < now) return 'Ce code a expiré.';
  if (p.max_uses != null && (p.used_count ?? 0) >= p.max_uses) return "Ce code a atteint sa limite d'utilisation.";
  const userIds: string[] = (p.users ?? []).map((x: any) => String(x));
  if (userIds.length) {
    if (!userId) return 'Ce code est réservé à certains clients — connectez-vous.';
    if (!userIds.includes(`user:${userId}`)) return "Ce code n'est pas valable pour votre compte.";
  }
  return null;
}

function resultat(r: RegleRemise, a: ReturnType<typeof appliquerRegle>): PromoResult {
  if (!a.ok) return { ok: false, error: a.erreur };
  return { ok: true, code: r.code, type: r.type, value: r.value, discount: a.discount, description: r.description || decrireRegle(r), auto: r.auto, lignes: a.lignes };
}

export async function validatePromo(codeRaw: string, cart: Panier, userId?: string): Promise<PromoResult> {
  const code = (codeRaw ?? '').trim().toUpperCase();
  if (!code) return { ok: false, error: 'Code manquant.' };
  const p = (await query<any>(`SELECT * FROM promo_code WHERE code = $code LIMIT 1`, { code }))[0];
  if (!p) return { ok: false, error: 'Code promo invalide.' };
  const err = horsJeu(p, userId);
  if (err) return { ok: false, error: err };
  const r = { ...(await versRegle(p)), auto: false };
  return resultat(r, appliquerRegle(r, await lignesPourCalcul(cart), cart.subtotal));
}

/** Le fonds : livres parus depuis plus de deux ans (défaut d'une promotion « fond »). */
export const FOND_ANS = 2;

/** Règles automatiques en vigueur pour ce visiteur : promotions « sans code » + club s'il est membre. */
async function reglesAutomatiques(userId?: string): Promise<RegleRemise[]> {
  const [promos, club, membre] = await Promise.all([
    query<any>(`SELECT * FROM promo_code WHERE active = true AND automatic = true`),
    getClub(),
    adhesionActive(userId)
  ]);
  const regles: RegleRemise[] = [];
  for (const p of promos) if (!horsJeu(p, userId)) regles.push({ ...(await versRegle(p)), auto: true });
  if (club.active && membre) regles.push(regleClub(club));
  return regles;
}

/** La meilleure réduction automatique pour ce panier, ou null. */
export async function promoAutomatique(cart: Panier, userId?: string): Promise<PromoResult | null> {
  if (!cart.lines.length) return null;
  const lignes = await lignesPourCalcul(cart);
  let meilleure: PromoResult | null = null;
  for (const r of await reglesAutomatiques(userId)) {
    const res = resultat(r, appliquerRegle(r, lignes, cart.subtotal));
    if (res.ok && (!meilleure || !meilleure.ok || res.discount > meilleure.discount)) meilleure = res;
  }
  return meilleure;
}

/**
 * Remise du panier : la plus avantageuse entre le code saisi (s'il est valable)
 * et les réductions automatiques (promotions, club). `codeErreur` : pourquoi le
 * code ne s'applique pas ; `codeMoinsBon` : valable, mais une autre remise est meilleure.
 */
export async function remisePanier(cart: Panier, userId?: string, code?: string | null): Promise<{ promo: PromoResult | null; codeErreur?: string; codeMoinsBon?: boolean }> {
  if (!cart.lines.length) return { promo: null };
  const [auto, saisi] = await Promise.all([promoAutomatique(cart, userId), code ? validatePromo(code, cart, userId) : Promise.resolve(null)]);
  if (saisi && !saisi.ok) return { promo: auto, codeErreur: saisi.error };
  if (saisi && saisi.ok && (!auto || !auto.ok || saisi.discount >= auto.discount)) return { promo: saisi };
  return { promo: auto, codeMoinsBon: !!(saisi && saisi.ok) };
}

/** Offres visibles sur la fiche d'un livre : promotions automatiques qui le couvrent, et le club. */
export interface OffreLivre { code: string; libelle: string; prix_paper?: number; prix_ebook?: number; club?: 'membre' | 'invitation' }
export async function offresPourLivre(book: { id: string; price_paper?: number | null; price_ebook?: number | null; published_at?: string | null; collections?: string[] }, userId?: string): Promise<OffreLivre[]> {
  const bid = recId('book', String(book.id).replace(/^book:/, ''));
  const [promos, club, membre, info] = await Promise.all([
    query<any>(`SELECT * FROM promo_code WHERE active = true AND automatic = true`), getClub(), adhesionActive(userId),
    query<any>(`SELECT primary_collection, collections FROM book WHERE id = $b LIMIT 1`, { b: bid })
  ]);
  const colls = [info[0]?.primary_collection, ...(info[0]?.collections ?? [])].filter(Boolean).map((c: any) => String(c));
  const ligne = { id: String(book.id), published_at: book.published_at ?? null, collections: book.collections ?? colls };
  const offres: OffreLivre[] = [];
  const prix = (r: RegleRemise) => sansCondition(r)
    ? { prix_paper: book.price_paper ? prixRemise(r, book.price_paper) : undefined, prix_ebook: book.price_ebook ? prixRemise(r, book.price_ebook) : undefined }
    : {};
  for (const p of promos) {
    if (horsJeu(p, userId)) continue;
    const r = await versRegle(p);
    if (!dansPerimetre(r, ligne)) continue;
    offres.push({ code: r.code, libelle: r.description || decrireRegle(r), ...prix(r) });
  }
  if (club.active) {
    const r = regleClub(club);
    if (dansPerimetre(r, ligne)) offres.push(membre ? { code: 'CLUB', libelle: r.description!, club: 'membre', ...prix(r) } : { code: 'CLUB', libelle: `−${club.remise} % pour les membres du ${club.nom}`, club: 'invitation' });
  }
  return offres;
}

/** Incrément du compteur d'utilisation (à la validation d'une commande). */
export async function recordPromoUse(codeRaw: string): Promise<void> {
  const code = (codeRaw ?? '').trim().toUpperCase();
  if (code) await query(`UPDATE promo_code SET used_count = (used_count ?? 0) + 1 WHERE code = $code`, { code });
}

// ── Back-office (CRUD) ────────────────────────────────────────
export interface PromoAdminRow {
  id: string; code: string; type: string; value: number; scope: string;
  active: boolean; automatic: boolean; used_count: number; max_uses?: number; starts_at?: string; ends_at?: string;
  /** Règle en clair (remise, périmètre, conditions). */
  regle: string;
}

export async function listPromosAdmin(): Promise<PromoAdminRow[]> {
  const rows = await query<any>(
    `SELECT *, meta::id(id) AS id FROM promo_code ORDER BY created_at DESC`);
  const regles = await Promise.all(rows.map((r: any) => versRegle(r)));
  return rows.map((r, i) => ({
    regle: decrireRegle(regles[i]),
    id: r.id, code: r.code, type: r.type, value: r.value ?? 0, scope: r.scope,
    active: !!r.active, automatic: r.automatic === true, used_count: r.used_count ?? 0,
    max_uses: r.max_uses ?? undefined, starts_at: r.starts_at ?? undefined, ends_at: r.ends_at ?? undefined
  }));
}

export async function getPromoForEdit(id: string) {
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, code, description, type, value, min_subtotal, starts_at, ends_at, max_uses, used_count, scope, active, automatic,
        fond_years, condition, condition_qty, max_items, condition_books.{ id: meta::id(id), label: title } AS condition_books,
        collections AS collection_ids,
        books.{ id: meta::id(id), label: title } AS books,
        users.{ id: meta::id(id), name: full_name, email: email } AS users
       FROM promo_code WHERE id = $id LIMIT 1`,
    { id: recId('promo_code', id) });
  const p = rows[0];
  if (!p) return null;
  return {
    ...p,
    collection_ids: (p.collection_ids ?? []).map((c: any) => String(c)),
    books: (p.books ?? []).filter((b: any) => b?.id).map((b: any) => ({ id: String(b.id), label: b.label ?? '—' })),
    condition_books: (p.condition_books ?? []).filter((b: any) => b?.id).map((b: any) => ({ id: String(b.id), label: b.label ?? '—' })),
    users: (p.users ?? []).filter((u: any) => u?.id).map((u: any) => ({ id: String(u.id), label: u.email ? `${u.name} · ${u.email}` : u.name }))
  };
}

export interface PromoInput {
  code: string; description?: string; type: string; value: number;
  min_subtotal?: number; starts_at?: string; ends_at?: string; max_uses?: number;
  scope: string; collectionIds: string[]; bookIds: string[]; userIds: string[]; active: boolean;
  /** Réduction automatique sur le site, sans code à saisir. */
  automatic?: boolean;
  fond_years?: number;
  condition?: string; condition_qty?: number; conditionBookIds?: string[];
  max_items?: number;
}

export async function savePromo(id: string | null, d: PromoInput): Promise<string> {
  const code = d.code.trim().toUpperCase();
  if (!code) throw new Error('CODE_REQUIRED');
  const { sql, vars } = buildSet({
    code, description: d.description?.trim() || undefined,
    type: d.type || 'percent', value: d.value ?? 0,
    min_subtotal: d.min_subtotal,
    starts_at: d.starts_at ? new Date(d.starts_at) : undefined,
    ends_at: d.ends_at ? new Date(d.ends_at) : undefined,
    max_uses: d.max_uses, scope: d.scope || 'all', active: !!d.active, automatic: !!d.automatic,
    fond_years: d.scope === 'fond' ? Math.max(1, d.fond_years ?? 2) : 2,
    condition: ['min_qty', 'contains'].includes(d.condition ?? '') ? d.condition : 'none',
    condition_qty: d.condition === 'min_qty' ? d.condition_qty : undefined,
    max_items: d.max_items && d.max_items > 0 ? d.max_items : undefined
  });
  // Tableaux (toujours écrits) — selon le périmètre.
  vars.collections = d.scope === 'collection' ? d.collectionIds.map((x) => recId('collection', x)) : [];
  vars.books = d.scope === 'book' ? d.bookIds.map((x) => recId('book', x)) : [];
  vars.users = d.userIds.map((x) => recId('user', x));
  vars.condition_books = d.condition === 'contains' ? (d.conditionBookIds ?? []).map((x) => recId('book', x.replace(/^book:/, ''))) : [];
  const arraysSql = 'collections = $collections, books = $books, users = $users, condition_books = $condition_books';

  if (id) {
    await query(`UPDATE $id SET ${sql}, ${arraysSql}`, { ...vars, id: recId('promo_code', id) });
    return id;
  }
  const rows = await query<any>(`CREATE promo_code SET ${sql}, ${arraysSql}`, vars);
  return String(rows[0].id).replace(/^promo_code:/, '');
}

export async function deletePromo(id: string): Promise<void> {
  await query(`DELETE $id`, { id: recId('promo_code', id) });
}
