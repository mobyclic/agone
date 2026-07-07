import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/access';
import { adminQuickSearch } from '$lib/server/admin-search';

export const GET: RequestHandler = async ({ url, locals }) => {
  requireStaff(locals);
  const results = await adminQuickSearch(url.searchParams.get('q') ?? '');
  return json({ results });
};
