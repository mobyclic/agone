import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import { getShipZoneForEdit, saveShipZone, deleteShipZone } from '$lib/server/shipping';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ params, locals }) => {
  requireStaff(locals);
  if (params.id === 'nouvelle') return { isNew: true, zone: null };
  const zone = await getShipZoneForEdit(params.id);
  if (!zone) throw error(404, { message: 'Zone introuvable' });
  return { isNew: false, zone };
};

export const actions: Actions = {
  save: async ({ request, params, locals }) => {
    requireStaff(locals);
    const fd = await request.formData();
    const S = (k: string) => String(fd.get(k) ?? '').trim();
    const N = (k: string) => { const v = S(k); return v === '' ? undefined : Number(v.replace(',', '.')); };
    let rates: { up_to: number | null; price: number }[] = [];
    try { const a = JSON.parse(S('rates') || '[]'); if (Array.isArray(a)) rates = a; } catch { rates = []; }
    if (!S('name')) return fail(400, { error: 'Le nom de la zone est requis.' });
    const editId = params.id && params.id !== 'nouvelle' ? params.id : null;
    const id = await saveShipZone(editId, {
      name: S('name'),
      rest_of_world: fd.get('rest_of_world') === 'on',
      countries: fd.getAll('countries').map(String),
      rates,
      free_over: N('free_over'),
      active: fd.get('active') === 'on'
    });
    throw redirect(303, withFlash(`/admin/livraison/${id}`, 'Zone enregistrée.', 'success'));
  },

  delete: async ({ params, locals }) => {
    requireStaff(locals);
    const id = params.id;
    if (id && id !== 'nouvelle') await deleteShipZone(id);
    throw redirect(303, withFlash('/admin/livraison', 'Zone supprimée.', 'success'));
  }
};
