import { redirect, fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { listReports, listChannels, createReport, addSalesLines, deleteReport } from '$lib/server/droits';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async () => {
  const [reports, channels] = await Promise.all([listReports(), listChannels()]);
  return { reports, channels };
};

/** Parse un collage CSV/TSV : ISBN, unités_vendues[, retours][, format][, prix]. */
function parseLines(raw: string) {
  const out: { isbn?: string; units_sold: number; units_returned?: number; format?: string; gross_price?: number }[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const cells = t.split(/[;,\t]/).map((c) => c.trim());
    // ignore une éventuelle ligne d'en-tête
    if (!/\d/.test(cells[0]) && !/\d/.test(cells[1] ?? '')) continue;
    const isbn = (cells[0] ?? '').replace(/\D/g, '');
    const units_sold = Number((cells[1] ?? '0').replace(',', '.')) || 0;
    const units_returned = Number((cells[2] ?? '0').replace(',', '.')) || 0;
    const format = /epub|num|ebook/i.test(cells[3] ?? '') ? 'ebook' : /sousc/i.test(cells[3] ?? '') ? 'souscription' : 'paper';
    const gross_price = cells[4] ? Number(cells[4].replace(',', '.')) : undefined;
    if (isbn) out.push({ isbn, units_sold, units_returned, format, gross_price });
  }
  return out;
}

export const actions: Actions = {
  create: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const S = (k: string) => (fd.get(k) ? String(fd.get(k)).trim() : '');
    if (!S('channelId') || !S('period_start') || !S('period_end')) return fail(400, { error: 'Canal et période requis.' });
    const reportId = await createReport({
      channelId: S('channelId'), period_start: S('period_start'), period_end: S('period_end'), label: S('label') || undefined
    });
    let n = 0;
    const raw = S('lines');
    if (raw) n = await addSalesLines(reportId, parseLines(raw));
    throw redirect(303, withFlash('/admin/droits/ventes', `Relevé créé (${n} lignes).`, 'success'));
  },

  delete: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const id = String(fd.get('reportId') || '');
    if (id) await deleteReport(id);
    throw redirect(303, withFlash('/admin/droits/ventes', 'Relevé supprimé.', 'success'));
  }
};
