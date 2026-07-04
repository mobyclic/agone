import type { LayoutServerLoad } from './$types';
import { cartCount } from '$lib/server/cart';
import { navMenus } from '$lib/server/nav-data';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
  return { user: locals.user, cartCount: cartCount(cookies), nav: await navMenus() };
};
