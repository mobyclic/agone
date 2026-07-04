import type { LayoutServerLoad } from './$types';
import { cartCount } from '$lib/server/cart';

export const load: LayoutServerLoad = ({ locals, cookies }) => {
  return { user: locals.user, cartCount: cartCount(cookies) };
};
