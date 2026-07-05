import type { PageServerLoad } from './$types';
import { listOrdersAdmin } from '$lib/server/order';

const LIMIT = 50;

export const load: PageServerLoad = async ({ url }) => {
  const q = url.searchParams.get('q') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const { orders, total } = await listOrdersAdmin({ q, status, limit: LIMIT, offset: (page - 1) * LIMIT });
  return { orders, total, q, status, page, limit: LIMIT };
};
