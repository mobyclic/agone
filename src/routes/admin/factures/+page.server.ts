import type { PageServerLoad } from './$types';
import { listInvoices } from '$lib/server/invoice';

const LIMIT = 50;

const TRIS = ['date_desc', 'date_asc', 'total_desc', 'total_asc', 'ref', 'client'] as const;

export const load: PageServerLoad = async ({ url }) => {
  const p = url.searchParams;
  const q = p.get('q') ?? undefined;
  const kind = p.get('kind') ?? undefined;
  const status = p.get('status') ?? undefined;
  const from = p.get('from') ?? undefined;
  const to = p.get('to') ?? undefined;
  const sort = (TRIS as readonly string[]).includes(p.get('sort') ?? '') ? (p.get('sort') as (typeof TRIS)[number]) : 'date_desc';
  const limit = [25, 50, 100, 200].includes(Number(p.get('limit'))) ? Number(p.get('limit')) : LIMIT;
  const page = Math.max(1, Number(p.get('page') ?? 1) || 1);
  const { invoices, total } = await listInvoices({ q, kind, status, from, to, sort, limit, offset: (page - 1) * limit });
  return { invoices, total, q, kind, status, from, to, sort, page, limit };
};
