/**
 * Panier — stocké dans un cookie (léger, sans état serveur).
 * Item = { id: "book:xxx", format: 'papier'|'epab'|'souscription', qty }.
 */
import type { Cookies } from '@sveltejs/kit';
import { query, recId } from './surreal';

const CART_COOKIE = 'ag_cart';
const PROMO_COOKIE = 'ag_promo';
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// — Code promo appliqué (stocké tel quel ; la remise est recalculée à chaque affichage) —
export function getPromoCode(cookies: Cookies): string | null {
  return cookies.get(PROMO_COOKIE) || null;
}
export function setPromoCode(cookies: Cookies, code: string) {
  cookies.set(PROMO_COOKIE, code.trim().toUpperCase(), { path: '/', httpOnly: true, sameSite: 'lax', secure: false, maxAge: 60 * 60 * 24 * 7 });
}
export function clearPromoCode(cookies: Cookies) {
  cookies.delete(PROMO_COOKIE, { path: '/' });
}

export interface CartItem { id: string; format: string; qty: number }
export interface CartLine {
  id: string; slug: string; title: string; cover_url?: string; author?: string;
  format: string; qty: number; unit_price: number; line_total: number; weight?: number;
}
export interface CartDetails {
  lines: CartLine[]; subtotal: number; item_count: number; has_ebook: boolean; has_physical: boolean; total_weight: number;
}

export function readCart(cookies: Cookies): CartItem[] {
  try {
    const raw = cookies.get(CART_COOKIE);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => x?.id && x.qty > 0).map((x) => ({ id: String(x.id), format: String(x.format || 'papier'), qty: Math.max(1, Math.min(99, Number(x.qty) || 1)) })) : [];
  } catch { return []; }
}

function write(cookies: Cookies, items: CartItem[]) {
  cookies.set(CART_COOKIE, JSON.stringify(items), { path: '/', httpOnly: true, sameSite: 'lax', secure: false, maxAge: 60 * 60 * 24 * 30 });
}

export function addToCart(cookies: Cookies, id: string, format: string, qty = 1) {
  const items = readCart(cookies);
  const ex = items.find((i) => i.id === id && i.format === format);
  if (ex) ex.qty = Math.min(99, ex.qty + qty);
  else items.push({ id, format, qty });
  write(cookies, items);
}
export function setQty(cookies: Cookies, id: string, format: string, qty: number) {
  let items = readCart(cookies);
  if (qty <= 0) items = items.filter((i) => !(i.id === id && i.format === format));
  else { const ex = items.find((i) => i.id === id && i.format === format); if (ex) ex.qty = Math.min(99, qty); }
  write(cookies, items);
}
export function removeFromCart(cookies: Cookies, id: string, format: string) {
  write(cookies, readCart(cookies).filter((i) => !(i.id === id && i.format === format)));
}
export function clearCart(cookies: Cookies) {
  cookies.delete(CART_COOKIE, { path: '/' });
}
export function cartCount(cookies: Cookies): number {
  return readCart(cookies).reduce((n, i) => n + i.qty, 0);
}

/** Slugs des livres présents dans le panier (léger : une requête slug seulement). */
export async function cartBookSlugs(cookies: Cookies): Promise<string[]> {
  const ids = [...new Set(readCart(cookies).map((i) => i.id))];
  if (!ids.length) return [];
  const rows = await query<any>(`SELECT slug FROM book WHERE id IN $ids`, { ids: ids.map((x) => recId('book', x)) });
  return rows.map((r) => r.slug).filter(Boolean);
}

function priceFor(book: any, format: string): number | null {
  if (format === 'epub') return book.price_ebook ?? null;
  if (format === 'souscription') return book.subscription_price ?? null;
  return book.price_paper ?? null;
}

export async function cartDetails(cookies: Cookies): Promise<CartDetails> {
  const items = readCart(cookies);
  if (!items.length) return { lines: [], subtotal: 0, item_count: 0, has_ebook: false, has_physical: false, total_weight: 0 };
  const ids = [...new Set(items.map((i) => i.id))];
  const books = await query<any>(
    `SELECT id, title, slug, price_paper, price_ebook, subscription_price, weight_grams, cover.url AS cover_url,
        ->contributed_by[WHERE role = 'author']->author.full_name AS a_names
       FROM book WHERE id IN $ids`,
    { ids: ids.map((x) => recId('book', x)) }
  );
  const byId = new Map(books.map((b) => [String(b.id), b]));
  const lines: CartLine[] = [];
  let subtotal = 0, item_count = 0, has_ebook = false, has_physical = false, total_weight = 0;
  for (const it of items) {
    const b = byId.get(it.id);
    if (!b) continue;
    const unit = priceFor(b, it.format);
    if (unit == null) continue;
    const line_total = r2(unit * it.qty);
    const weight = it.format === 'epub' ? 0 : (b.weight_grams ?? 0);
    lines.push({ id: it.id, slug: b.slug, title: b.title, cover_url: b.cover_url ?? undefined, author: (b.a_names ?? [])[0] ?? undefined, format: it.format, qty: it.qty, unit_price: unit, line_total, weight });
    subtotal += line_total; item_count += it.qty;
    total_weight += weight * it.qty;
    if (it.format === 'epub') has_ebook = true; else has_physical = true;
  }
  return { lines, subtotal: r2(subtotal), item_count, has_ebook, has_physical, total_weight };
}
