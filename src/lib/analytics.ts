// Analytics — événements e-commerce GA4 poussés dans le dataLayer GTM.
//
// Le site charge Google Tag Manager (voir +layout.svelte). GTM possède les tags
// qui relaient ces événements vers GA4, le Meta Pixel (Instagram/Facebook Ads)
// et Google Ads. Ce module ne fait QUE pousser les bons événements au schéma
// GA4 `ecommerce`, pour que les tags aient des données propres à mapper.
//
// Consentement : on pousse TOUJOURS dans le dataLayer. Qu'un tag se déclenche
// ou non est décidé par GTM + Consent Mode v2 (voir lib/consent.ts).
//
// item_id : id de livre nu (sans le préfixe `book:`), identique sur tous les
// événements pour que Meta/Google attribuent les conversions au catalogue.

const CURRENCY = 'EUR';
type DL = Record<string, any>;

function dataLayer(): any[] {
  if (typeof window === 'undefined') return [];
  const w = window as any;
  return (w.dataLayer = w.dataLayer || []);
}
const round2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;

/** `book:abc` → `abc` (identique entre événements et flux produit). */
export function itemId(id: unknown): string {
  let s = String(id ?? '').trim();
  const c = s.indexOf(':');
  if (c >= 0) s = s.slice(c + 1);
  return s.replace(/^⟨/, '').replace(/⟩$/, '');
}

export interface TrackItem {
  item_id: string;
  item_name: string;
  price: number;
  quantity?: number;
  item_variant?: string; // format : Papier / ePub…
  item_category?: string; // collection
}

function cleanItem(i: TrackItem): DL {
  const out: DL = { item_id: i.item_id, item_name: i.item_name, price: round2(i.price), quantity: i.quantity ?? 1 };
  if (i.item_variant) out.item_variant = i.item_variant;
  if (i.item_category) out.item_category = i.item_category;
  return out;
}
const itemsValue = (items: TrackItem[]) => round2(items.reduce((s, i) => s + (Number(i.price) || 0) * (i.quantity ?? 1), 0));

/** Pousse un événement ecommerce GA4. On remet `ecommerce` à null avant pour
 *  éviter toute fuite de valeurs entre événements (best practice GA4). */
function pushEcommerce(event: string, ecommerce: DL): void {
  const dl = dataLayer();
  dl.push({ ecommerce: null });
  dl.push({ event, ecommerce });
}

export function trackViewItem(item: TrackItem): void {
  pushEcommerce('view_item', { currency: CURRENCY, value: round2(item.price), items: [cleanItem(item)] });
}

export function trackAddToCart(item: TrackItem): void {
  pushEcommerce('add_to_cart', { currency: CURRENCY, value: itemsValue([item]), items: [cleanItem(item)] });
}

export function trackBeginCheckout(items: TrackItem[], opts: { value?: number; coupon?: string } = {}): void {
  pushEcommerce('begin_checkout', {
    currency: CURRENCY,
    value: opts.value != null ? round2(opts.value) : itemsValue(items),
    ...(opts.coupon ? { coupon: opts.coupon } : {}),
    items: items.map(cleanItem)
  });
}

export function trackPurchase(p: {
  transaction_id: string;
  value: number;
  items: TrackItem[];
  coupon?: string;
  shipping?: number;
}): void {
  if (!claimPurchase(p.transaction_id)) return; // dedup : pas de double comptage au refresh
  pushEcommerce('purchase', {
    transaction_id: p.transaction_id,
    currency: CURRENCY,
    value: round2(p.value),
    ...(p.shipping != null ? { shipping: round2(p.shipping) } : {}),
    ...(p.coupon ? { coupon: p.coupon } : {}),
    items: p.items.map(cleanItem)
  });
}

export function trackSearch(term: string): void {
  const q = (term ?? '').trim();
  if (q) dataLayer().push({ event: 'search', search_term: q });
}

/** true la 1re fois qu'un id de transaction est vu dans la session (sinon false). */
function claimPurchase(transactionId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const key = `ag_purchase_${transactionId}`;
    if (window.sessionStorage.getItem(key)) return false;
    window.sessionStorage.setItem(key, '1');
    return true;
  } catch {
    return true;
  }
}
