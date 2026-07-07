import type { PageServerLoad } from './$types';
import { listEventsAdmin } from '$lib/server/events';

const LIMIT = 50;

export const load: PageServerLoad = async ({ url }) => {
  const q = url.searchParams.get('q') ?? undefined;
  const when = url.searchParams.get('when') ?? 'upcoming';
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const { events, total } = await listEventsAdmin({ q, when, limit: LIMIT, offset: (page - 1) * LIMIT });
  return { events, total, q, when, page, limit: LIMIT };
};
