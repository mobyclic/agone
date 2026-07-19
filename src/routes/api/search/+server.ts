import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { siteSearch } from '$lib/server/search';

export const GET: RequestHandler = async ({ url }) => {
  return json(await siteSearch(url.searchParams.get('q') ?? ''));
};
