import type { PageServerLoad } from './$types';
import { listInvoices } from '$lib/server/invoice';

const LIMIT = 50;

export const load: PageServerLoad = async ({ url }) => {
  const q = url.searchParams.get('q') ?? undefined;
  const kind = url.searchParams.get('kind') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const { invoices, total } = await listInvoices({ q, kind, status, limit: LIMIT, offset: (page - 1) * LIMIT });
  return { invoices, total, q, kind, status, page, limit: LIMIT };
};
