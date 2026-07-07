import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/access';
import { searchBooksForOrder } from '$lib/server/catalogue';

export const GET: RequestHandler = async ({ url, locals }) => {
  requireStaff(locals);
  const results = await searchBooksForOrder(url.searchParams.get('q') ?? '');
  return json({ results });
};
