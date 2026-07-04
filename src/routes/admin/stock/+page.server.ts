import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import { syncBldStock } from '$lib/server/belleslettres';
import { query } from '$lib/server/surreal';
import { env } from '$env/dynamic/private';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ url }) => {
  const q = url.searchParams.get('q') ?? undefined;
  const where = ['isbn_paper != NONE'];
  const vars: Record<string, unknown> = { limit: 60 };
  if (q && q.trim()) { vars.q = q.trim().toLowerCase(); where.push('string::lowercase(title) CONTAINS $q'); }
  const [books, movements] = await Promise.all([
    query<any>(`SELECT title, isbn_paper, stock_qty, stock_synced_at FROM book WHERE ${where.join(' AND ')} ORDER BY stock_qty ASC LIMIT $limit`, vars),
    query<any>(`SELECT book.title AS title, isbn, old_qty, new_qty, delta, synced_at FROM stock_movement ORDER BY synced_at DESC LIMIT 25`)
  ]);
  return { books, movements, q, blConfigured: !!(env.BL_EXTRANET_USER && env.BL_EXTRANET_PASS) };
};

export const actions: Actions = {
  sync: async ({ locals }) => {
    requireStaff(locals);
    let msg: string;
    try {
      const r = await syncBldStock();
      msg = `Stock BLDD : ${r.matched} titres appariés, ${r.updated} mis à jour.`;
    } catch (e: any) {
      return fail(500, { error: String(e?.message ?? e) });
    }
    throw redirect(303, withFlash('/admin/stock', msg, 'success'));
  }
};
