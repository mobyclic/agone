import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { listerJournal } from '$lib/server/journal';

const LIMIT = 100;

export const load: PageServerLoad = async ({ url, locals }) => {
  requireAdmin(locals);
  const type = url.searchParams.get('type') ?? undefined;
  const q = url.searchParams.get('q') ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const { entrees, total } = await listerJournal({ type, q, limit: LIMIT, offset: (page - 1) * LIMIT });
  return { entrees, total, type, q, page, limit: LIMIT };
};
