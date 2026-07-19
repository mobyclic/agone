import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/access';
import { searchCustomers } from '$lib/server/account';

export const GET: RequestHandler = async ({ url, locals }) => {
  requireStaff(locals);
  const rows = await searchCustomers(url.searchParams.get('q') ?? '');
  return json(rows.map((u) => ({ id: u.id, label: u.email ? `${u.full_name} · ${u.email}` : u.full_name })));
};
