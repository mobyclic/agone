import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/access';
import { geocodeAddress } from '$lib/server/geocode';

export const GET: RequestHandler = async ({ url, locals }) => {
  requireStaff(locals);
  return json(await geocodeAddress(url.searchParams.get('q') ?? ''));
};
