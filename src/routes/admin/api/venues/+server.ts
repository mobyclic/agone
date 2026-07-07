import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/access';
import { searchVenues } from '$lib/server/events';

export const GET: RequestHandler = async ({ url, locals }) => {
  requireStaff(locals);
  const results = await searchVenues(url.searchParams.get('q') ?? '');
  return json({ results });
};
