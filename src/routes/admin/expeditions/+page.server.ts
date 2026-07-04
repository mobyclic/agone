import { redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import { exportBlOrders, isBlFtpEnabled } from '$lib/server/belleslettres';
import { query } from '$lib/server/surreal';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async () => {
  const [exports, pendingRows] = await Promise.all([
    query<any>(`SELECT id, filename, order_count, book_count, status, dry_run, created_at FROM bl_export ORDER BY created_at DESC LIMIT 30`),
    query<any>(`SELECT count() AS n FROM order WHERE status = 'paid' AND has_physical = true AND bl_exported_at = NONE GROUP ALL`)
  ]);
  return { exports, pending: pendingRows[0]?.n ?? 0, ftpEnabled: isBlFtpEnabled() };
};

export const actions: Actions = {
  generate: async ({ locals }) => {
    requireStaff(locals);
    const r = await exportBlOrders();
    const msg = r
      ? `Fichier ${r.filename} généré : ${r.order_count} commandes, ${r.book_count} livres${r.dry_run ? ' — DRY-RUN (non transmis au FTP)' : r.uploaded ? ' — transmis au FTP ✓' : ' — échec FTP'}.`
      : 'Aucune commande à exporter.';
    throw redirect(303, withFlash('/admin/expeditions', msg, 'success'));
  }
};
