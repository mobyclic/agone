import type { LayoutServerLoad } from './$types';
import { cartCount } from '$lib/server/cart';
import { navMenus } from '$lib/server/nav-data';
import { getSetting } from '$lib/server/site';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
  const t = (await getSetting('tracking')) as Record<string, any> | null;
  const tracking = {
    gtm_id: String(t?.gtm_id ?? '').trim(),
    ga_id: String(t?.ga_id ?? '').trim(),
    meta_pixel_id: String(t?.meta_pixel_id ?? '').trim()
  };
  return { user: locals.user, cartCount: cartCount(cookies), nav: await navMenus(), tracking };
};
