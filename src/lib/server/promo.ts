/**
 * Codes promo — validation/remise côté panier + CRUD back-office.
 */
import { query, recId } from './surreal';
import type { CartLine } from './cart';

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
/** `auto` : promotion appliquée d'office, sans code saisi. */
export type PromoResult =
  | { ok: true; code: string; type: 'percent' | 'amount'; value: number; discount: number; description?: string; auto?: boolean }
  | { ok: false; error: string };

const money = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

export async function validatePromo(
  codeRaw: string,
  cart: { subtotal: number; lines: CartLine[] },
  userId?: string
): Promise<PromoResult> {
  const code = (codeRaw ?? '').trim().toUpperCase();
  if (!code) return { ok: false, error: 'Code manquant.' };

  const p = (await query<any>(`SELECT * FROM promo_code WHERE code = $code LIMIT 1`, { code }))[0];
  if (!p || !p.active) return { ok: false, error: 'Code promo invalide.' };

  const now = Date.now();
  if (p.starts_at && new Date(p.starts_at).getTime() > now) return { ok: false, error: "Ce code n'est pas encore actif." };
  if (p.ends_at && new Date(p.ends_at).getTime() < now) return { ok: false, error: 'Ce code a expiré.' };
  if (p.max_uses != null && (p.used_count ?? 0) >= p.max_uses) return { ok: false, error: "Ce code a atteint sa limite d'utilisation." };

  // Réservé à certains clients ?
  const userIds: string[] = (p.users ?? []).map((x: any) => String(x));
  if (userIds.length) {
    if (!userId) return { ok: false, error: 'Ce code est réservé à certains clients — connectez-vous.' };
    if (!userIds.includes(`user:${userId}`)) return { ok: false, error: "Ce code n'est pas valable pour votre compte." };
  }

  if (p.min_subtotal != null && cart.subtotal < p.min_subtotal)
    return { ok: false, error: `Commande minimum de ${money(p.min_subtotal)} requise.` };

  const eligible = await sousTotalEligible(p, cart);
  if (eligible <= 0) return { ok: false, error: "Ce code ne s'applique à aucun article du panier." };

  const discount = remiseSur(p, eligible, cart.subtotal);
  if (discount <= 0) return { ok: false, error: 'Remise nulle.' };

  return { ok: true, code, type: p.type, value: p.value ?? 0, discount, description: p.description ?? undefined, auto: !!p.automatic };
}

/** Le fond : livres parus depuis plus de deux ans. */
export const FOND_ANS = 2;

/** Sous-total du panier auquel la promotion s'applique, selon son périmètre. */
async function sousTotalEligible(p: any, cart: { subtotal: number; lines: CartLine[] }): Promise<number> {
  // Les lignes du panier portent l'identifiant nu ; la base rend « book:id » : on compare à nu.
  const nu = (x: unknown) => String(x ?? '').replace(/^book:/, '');
  if (p.scope === 'book') {
    const bookIds = new Set((p.books ?? []).map(nu));
    return cart.lines.filter((l) => bookIds.has(nu(l.id))).reduce((s, l) => s + l.line_total, 0);
  }
  if (p.scope === 'collection' || p.scope === 'fond') {
    const lineIds = cart.lines.map((l) => l.id);
    const books = lineIds.length
      ? await query<any>(`SELECT id, primary_collection, collections, published_at FROM book WHERE id IN $ids`, { ids: lineIds.map((x) => recId('book', x)) })
      : [];
    const eligibleIds = new Set<string>();
    if (p.scope === 'fond') {
      const limite = new Date(); limite.setFullYear(limite.getFullYear() - FOND_ANS);
      for (const b of books) if (b.published_at && new Date(b.published_at) <= limite) eligibleIds.add(nu(b.id));
    } else {
      const collIds = new Set((p.collections ?? []).map((x: any) => String(x)));
      for (const b of books) {
        const bColls = [b.primary_collection, ...(b.collections ?? [])].filter(Boolean).map((c: any) => String(c));
        if (bColls.some((c) => collIds.has(c))) eligibleIds.add(nu(b.id));
      }
    }
    return cart.lines.filter((l) => eligibleIds.has(nu(l.id))).reduce((s, l) => s + l.line_total, 0);
  }
  return cart.subtotal;
}

function remiseSur(p: any, eligible: number, subtotal: number): number {
  const d = p.type === 'percent' ? (eligible * (p.value ?? 0)) / 100 : Math.min(p.value ?? 0, eligible);
  return r2(Math.min(d, subtotal));
}

/**
 * Réduction automatique : parmi les promotions actives « sans code », celle qui
 * remise le plus ce panier (dates, limite d'usage, clients réservés et minimum
 * respectés). null si aucune ne s'applique.
 */
export async function promoAutomatique(cart: { subtotal: number; lines: CartLine[] }, userId?: string): Promise<PromoResult | null> {
  if (!cart.lines.length) return null;
  const promos = await query<any>(`SELECT * FROM promo_code WHERE active = true AND automatic = true`);
  const now = Date.now();
  let meilleure: PromoResult | null = null;
  for (const p of promos) {
    if (p.starts_at && new Date(p.starts_at).getTime() > now) continue;
    if (p.ends_at && new Date(p.ends_at).getTime() < now) continue;
    if (p.max_uses != null && (p.used_count ?? 0) >= p.max_uses) continue;
    const userIds: string[] = (p.users ?? []).map((x: any) => String(x));
    if (userIds.length && (!userId || !userIds.includes(`user:${userId}`))) continue;
    if (p.min_subtotal != null && cart.subtotal < p.min_subtotal) continue;
    const discount = remiseSur(p, await sousTotalEligible(p, cart), cart.subtotal);
    if (discount <= 0) continue;
    if (!meilleure || !meilleure.ok || discount > meilleure.discount) meilleure = { ok: true, code: p.code, type: p.type, value: p.value ?? 0, discount, description: p.description ?? undefined, auto: true };
  }
  return meilleure;
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
}

export async function listPromosAdmin(): Promise<PromoAdminRow[]> {
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, code, type, value, scope, active, automatic, used_count, max_uses, starts_at, ends_at, created_at
       FROM promo_code ORDER BY created_at DESC`);
  return rows.map((r) => ({
    id: r.id, code: r.code, type: r.type, value: r.value ?? 0, scope: r.scope,
    active: !!r.active, automatic: r.automatic === true, used_count: r.used_count ?? 0,
    max_uses: r.max_uses ?? undefined, starts_at: r.starts_at ?? undefined, ends_at: r.ends_at ?? undefined
  }));
}

export async function getPromoForEdit(id: string) {
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, code, description, type, value, min_subtotal, starts_at, ends_at, max_uses, used_count, scope, active, automatic,
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
    users: (p.users ?? []).filter((u: any) => u?.id).map((u: any) => ({ id: String(u.id), label: u.email ? `${u.name} · ${u.email}` : u.name }))
  };
}

export interface PromoInput {
  code: string; description?: string; type: string; value: number;
  min_subtotal?: number; starts_at?: string; ends_at?: string; max_uses?: number;
  scope: string; collectionIds: string[]; bookIds: string[]; userIds: string[]; active: boolean;
  /** Réduction automatique sur le site, sans code à saisir. */
  automatic?: boolean;
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
    max_uses: d.max_uses, scope: d.scope || 'all', active: !!d.active, automatic: !!d.automatic
  });
  // Tableaux (toujours écrits) — selon le périmètre.
  vars.collections = d.scope === 'collection' ? d.collectionIds.map((x) => recId('collection', x)) : [];
  vars.books = d.scope === 'book' ? d.bookIds.map((x) => recId('book', x)) : [];
  vars.users = d.userIds.map((x) => recId('user', x));
  const arraysSql = 'collections = $collections, books = $books, users = $users';

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
