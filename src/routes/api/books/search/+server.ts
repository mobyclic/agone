import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/access';
import { searchBooksForPicker } from '$lib/server/catalogue';

export const GET: RequestHandler = async ({ url, locals }) => {
  requireStaff(locals);
  const q = url.searchParams.get('q') ?? '';
  return json(await searchBooksForPicker(q));
};
