import { redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { cartDetails, addToCart, setQty, removeFromCart, clearCart } from '$lib/server/cart';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ cookies }) => {
  return { cart: await cartDetails(cookies) };
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
    throw redirect(303, '/panier');
  }
};
