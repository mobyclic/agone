/**
 * Panier — stocké dans un cookie (léger, sans état serveur).
 * Item = { id: "book:xxx", format: 'papier'|'epab'|'souscription', qty }.
 */
import type { Cookies } from '@sveltejs/kit';
import { query, recId } from './surreal';

const CART_COOKIE = 'ag_cart';
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface CartItem { id: string; format: string; qty: number }
export interface CartLine {
  id: string; slug: string; title: string; cover_url?: string;
  format: string; qty: number; unit_price: number; line_total: number;
}
export interface CartDetails {
  lines: CartLine[]; subtotal: number; item_count: number; has_ebook: boolean; has_physical: boolean;
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

function priceFor(book: any, format: string): number | null {
  if (format === 'epub') return book.price_ebook ?? null;
  if (format === 'souscription') return book.subscription_price ?? null;
  return book.price_paper ?? null;
}

export async function cartDetails(cookies: Cookies): Promise<CartDetails> {
  const items = readCart(cookies);
  if (!items.length) return { lines: [], subtotal: 0, item_count: 0, has_ebook: false, has_physical: false };
  const ids = [...new Set(items.map((i) => i.id))];
  const books = await query<any>(
    `SELECT id, title, slug, price_paper, price_ebook, subscription_price, cover.url AS cover_url FROM book WHERE id IN $ids`,
    { ids: ids.map((x) => recId('book', x)) }
  );
  const byId = new Map(books.map((b) => [String(b.id), b]));
  const lines: CartLine[] = [];
  let subtotal = 0, item_count = 0, has_ebook = false, has_physical = false;
  for (const it of items) {
    const b = byId.get(it.id);
    if (!b) continue;
    const unit = priceFor(b, it.format);
    if (unit == null) continue;
    const line_total = r2(unit * it.qty);
    lines.push({ id: it.id, slug: b.slug, title: b.title, cover_url: b.cover_url ?? undefined, format: it.format, qty: it.qty, unit_price: unit, line_total });
    subtotal += line_total; item_count += it.qty;
    if (it.format === 'epub') has_ebook = true; else has_physical = true;
  }
  return { lines, subtotal: r2(subtotal), item_count, has_ebook, has_physical };
}
