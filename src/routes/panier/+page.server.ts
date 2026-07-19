import { redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
  cartDetails, addToCart, setQty, removeFromCart, clearCart,
  getPromoCode, setPromoCode, clearPromoCode
} from '$lib/server/cart';
import { validatePromo } from '$lib/server/promo';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ cookies, locals }) => {
  const cart = await cartDetails(cookies);
  const code = getPromoCode(cookies);
  const promo = code && cart.lines.length ? await validatePromo(code, cart, locals.user?.id) : null;
  return { cart, promo, promoCode: code };
};

export const actions: Actions = {
  add: async ({ request, cookies }) => {
    const fd = await request.formData();
    const id = String(fd.get('id') || '');
    const format = String(fd.get('format') || 'papier');
    const qty = Math.max(1, Number(fd.get('qty')) || 1);
    if (id) addToCart(cookies, id, format, qty);
    throw redirect(303, withFlash('/panier', 'Ajouté au panier.', 'success'));
  },
  update: async ({ request, cookies }) => {
    const fd = await request.formData();
    setQty(cookies, String(fd.get('id') || ''), String(fd.get('format') || 'papier'), Number(fd.get('qty')) || 0);
    throw redirect(303, '/panier');
  },
  remove: async ({ request, cookies }) => {
    const fd = await request.formData();
    removeFromCart(cookies, String(fd.get('id') || ''), String(fd.get('format') || 'papier'));
    throw redirect(303, '/panier');
  },
  clear: async ({ cookies }) => {
    clearCart(cookies);
    clearPromoCode(cookies);
    throw redirect(303, '/panier');
  },
  applyPromo: async ({ request, cookies, locals }) => {
    const fd = await request.formData();
    const code = String(fd.get('code') || '').trim();
    if (!code) throw redirect(303, '/panier');
    const cart = await cartDetails(cookies);
    const res = await validatePromo(code, cart, locals.user?.id);
    if (!res.ok) throw redirect(303, withFlash('/panier', res.error, 'error'));
    setPromoCode(cookies, code);
    throw redirect(303, withFlash('/panier', `Code « ${res.code} » appliqué.`, 'success'));
  },
  removePromo: async ({ cookies }) => {
    clearPromoCode(cookies);
    throw redirect(303, '/panier');
  }
};
