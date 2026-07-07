import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/access';
import { searchCustomers } from '$lib/server/account';

export const GET: RequestHandler = async ({ url, locals }) => {
  requireStaff(locals);
  const results = await searchCustomers(url.searchParams.get('q') ?? '');
  return json({ results });
};
