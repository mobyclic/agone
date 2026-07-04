import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/access';
import { query, recId } from '$lib/server/surreal';

// +server sous /admin n'hérite PAS de la garde du layout → on re-garde ici.
export const GET: RequestHandler = async ({ params, locals }) => {
  requireStaff(locals);
  const rows = await query<any>(`SELECT filename, body FROM bl_export WHERE id = $id LIMIT 1`, { id: recId('bl_export', params.id) });
  const e = rows[0];
  if (!e) throw error(404, { message: 'Export introuvable' });
  return new Response(e.body, {
    headers: {
      'Content-Type': 'text/plain; charset=us-ascii',
      'Content-Disposition': `attachment; filename="${e.filename}"`
    }
  });
};
