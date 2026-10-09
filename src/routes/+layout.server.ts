import type { LayoutServerLoad } from './$types';
import { cartCount } from '$lib/server/cart';
import { navMenus } from '$lib/server/nav-data';
import { getSetting } from '$lib/server/site';
import { reclamesActives } from '$lib/server/reclames';

export const load: LayoutServerLoad = async ({ locals, cookies, depends }) => {
  // Permet un rafraîchissement ciblé du compteur panier (invalidate('app:cart'))
  // sans re-jouer les load lourds des pages (fiche livre & suggestions).
  depends('app:cart');
  const [t, reclames] = await Promise.all([getSetting('tracking') as Promise<Record<string, any> | null>, reclamesActives()]);
  const tracking = {
    gtm_id: String(t?.gtm_id ?? '').trim(),
    ga_id: String(t?.ga_id ?? '').trim(),
    meta_pixel_id: String(t?.meta_pixel_id ?? '').trim()
  };
  // Réclames publiées et dans leurs dates : au plus un bandeau et une fenêtre.
  const bandeau = reclames.bandeau ? { active: true, message: reclames.bandeau.message ?? reclames.bandeau.title, variant: reclames.bandeau.variant, url: reclames.bandeau.url } : null;
  const m = reclames.modal;
  const fenetre = m ? { title: m.title, body: m.message ?? '', cta_label: m.cta_label ?? '', cta_url: m.url ?? '', image_url: m.image_url ?? '', frequency: m.frequency, delay: m.delay, version: `${m.id}:${m.updated_at}` } : null;
  return { user: locals.user, cartCount: cartCount(cookies), nav: await navMenus(), tracking, bandeau, fenetre };
};
