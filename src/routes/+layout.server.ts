import type { LayoutServerLoad } from './$types';
import { cartCount } from '$lib/server/cart';
import { navMenus } from '$lib/server/nav-data';
import { getSetting } from '$lib/server/site';

export const load: LayoutServerLoad = async ({ locals, cookies, depends }) => {
  // Permet un rafraîchissement ciblé du compteur panier (invalidate('app:cart'))
  // sans re-jouer les load lourds des pages (fiche livre & suggestions).
  depends('app:cart');
  const [t, banner, popup] = await Promise.all([
    getSetting('tracking') as Promise<Record<string, any> | null>, getSetting('banner') as Promise<Record<string, any> | null>, getSetting('popup') as Promise<Record<string, any> | null>
  ]);
  // Réclames : bandeau tel quel ; fenêtre seulement si active et dans ses dates.
  const msg = banner?.message;
  const bandeau = banner?.active === true ? { active: true, message: typeof msg === 'object' && msg ? String(msg.fr ?? '') : String(msg ?? ''), variant: String(banner.variant ?? 'info'), url: banner.url ? String(banner.url) : undefined } : null;
  const maintenant = Date.now();
  const fenetre = popup?.active === true && (!popup.starts_at || new Date(popup.starts_at).getTime() <= maintenant) && (!popup.ends_at || new Date(popup.ends_at).getTime() + 86400_000 > maintenant)
    ? { title: String(popup.title ?? ''), body: String(popup.body ?? ''), cta_label: String(popup.cta_label ?? ''), cta_url: String(popup.cta_url ?? ''), image_url: String(popup.image_url ?? ''), frequency: String(popup.frequency ?? 'day'), delay: Number(popup.delay ?? 2), version: String(popup.version ?? '1') }
    : null;
  const tracking = {
    gtm_id: String(t?.gtm_id ?? '').trim(),
    ga_id: String(t?.ga_id ?? '').trim(),
    meta_pixel_id: String(t?.meta_pixel_id ?? '').trim()
  };
  return { user: locals.user, cartCount: cartCount(cookies), nav: await navMenus(), tracking, bandeau, fenetre };
};
