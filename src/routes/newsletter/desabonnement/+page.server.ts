import type { PageServerLoad } from './$types';
import { unsubscribeByToken } from '$lib/server/newsletter';

export const load: PageServerLoad = async ({ url }) => {
  const token = url.searchParams.get('token') ?? '';
  const email = token ? await unsubscribeByToken(token) : null;
  return { hadToken: !!token, done: !!email, email };
};
