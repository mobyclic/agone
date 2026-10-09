import { redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
  cartDetails, addToCart, setQty, removeFromCart, clearCart,
  getPromoCode, setPromoCode, clearPromoCode
} from '$lib/server/cart';
import { validatePromo, remisePanier } from '$lib/server/promo';
import { getClub, adhesionActive, portOffert } from '$lib/server/club';
import { query, recId } from '$lib/server/surreal';
import { formatVendable } from '$lib/server/catalogue';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ cookies, locals }) => {
  const cart = await cartDetails(cookies);
  const code = getPromoCode(cookies);
  // La plus avantageuse entre le code saisi et les réductions automatiques (promotions, club).
  const [remise, club, membre] = await Promise.all([remisePanier(cart, locals.user?.id, code), getClub(), adhesionActive(locals.user?.id)]);
  const ids = cart.lines.map((l) => recId('book', String(l.id).replace(/^book:/, '')));
  const parutions = ids.length && cart.has_physical ? await query<string>(`SELECT VALUE published_at FROM book WHERE id IN $ids`, { ids }) : [];
  return {
    cart, promo: remise.promo, promoCode: code, codeErreur: remise.codeErreur, codeMoinsBon: remise.codeMoinsBon,
    club: club.active ? { nom: club.nom, remise: club.remise, membre: !!membre } : null,
    francoClub: cart.has_physical && portOffert(club, !!membre, parutions)
  };
};

export const actions: Actions = {
  add: async ({ request, cookies }) => {
    const fd = await request.formData();
    const id = String(fd.get('id') || '');
    const format = String(fd.get('format') || 'papier');
    const qty = Math.max(1, Number(fd.get('qty')) || 1);
    if (!id) throw redirect(303, '/panier');
    // Dernier mot au serveur : stock épuisé, prix absent, fichier ebook manquant…
    const v = await formatVendable(id, format);
    if (!v.ok) throw redirect(303, withFlash('/panier', v.raison, 'error'));
    addToCart(cookies, id, format, qty);
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
