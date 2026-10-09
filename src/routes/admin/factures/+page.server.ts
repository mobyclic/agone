import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/access';
import { definirComptageVentes } from '$lib/server/facturesVentes';
import { journaliser } from '$lib/server/journal';
import { withFlash } from '$lib/toasts';
import { listInvoices } from '$lib/server/invoice';
import { getClientPro } from '$lib/server/clients';
import { query, recId } from '$lib/server/surreal';

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
  const clientId = p.get('client') ?? undefined;
  const customerId = p.get('customer') ?? undefined;
  const [{ invoices, total }, pro, particulier] = await Promise.all([
    listInvoices({ q, kind, status, from, to, clientId, customerId, sort, limit, offset: (page - 1) * limit }),
    clientId ? getClientPro(clientId) : null,
    customerId ? query<any>(`SELECT full_name, email FROM ONLY $id`, { id: recId('user', customerId) }) : null
  ]);
  // Le client filtré, tel qu'on le nomme dans la pastille.
  const clientFiltre = pro ? { type: 'pro' as const, id: pro.id, label: pro.name }
    : customerId && particulier ? { type: 'user' as const, id: customerId, label: (particulier as any).full_name || (particulier as any).email || 'client' } : null;
  return { invoices, total, q, kind, status, from, to, sort, page, limit, clientFiltre };
};

export const actions: Actions = {
  /** Sélection → compter (ou non) dans les ventes ; utile pour les factures importées de MEG. */
  ventes: async ({ request, locals, url }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const ids = String(fd.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const mode = String(fd.get('mode') ?? '');
    if (!ids.length) return fail(400, { error: 'Aucun document coché.' });
    let comptees = 0, retirees = 0;
    for (const id of ids) {
      try {
        const r = await definirComptageVentes(id, mode === 'inclure' ? true : mode === 'exclure' ? false : null);
        if (r.comptee) comptees++; else retirees++;
      } catch { retirees++; }
    }
    await journaliser(locals, { action: 'invoice.ventes_lot', details: { mode, ids: ids.length, comptees, retirees } });
    throw redirect(303, withFlash(`/admin/factures${url.search}`, `${comptees} document${comptees > 1 ? 's' : ''} compté${comptees > 1 ? 's' : ''} dans les ventes, ${retirees} non compté${retirees > 1 ? 's' : ''}.`, 'success'));
  }
};
