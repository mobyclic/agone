import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import { getPromoForEdit, savePromo, deletePromo } from '$lib/server/promo';
import { allCollections } from '$lib/server/catalogue';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ params, locals }) => {
  requireStaff(locals);
  const collections = await allCollections();
  if (params.id === 'nouveau') return { isNew: true, promo: null, collections };
  const promo = await getPromoForEdit(params.id);
  if (!promo) throw error(404, { message: 'Code introuvable' });
  return { isNew: false, promo, collections };
};

export const actions: Actions = {
  save: async ({ request, params, locals }) => {
    requireStaff(locals);
    const fd = await request.formData();
    const S = (k: string) => String(fd.get(k) ?? '').trim();
    const N = (k: string) => { const v = S(k); return v === '' ? undefined : Number(v.replace(',', '.')); };
    const I = (k: string) => { const v = N(k); return v == null || Number.isNaN(v) ? undefined : Math.trunc(v); };
    const J = (k: string) => { try { const a = JSON.parse(S(k) || '[]'); return Array.isArray(a) ? a.map(String) : []; } catch { return []; } };

    if (!S('code')) return fail(400, { error: 'Le code est requis.' });
    const editId = params.id && params.id !== 'nouveau' ? params.id : null;

    let id: string;
    try {
      id = await savePromo(editId, {
        code: S('code'), description: S('description') || undefined,
        type: S('type') || 'percent', value: N('value') ?? 0,
        min_subtotal: N('min_subtotal'),
        starts_at: S('starts_at') || undefined, ends_at: S('ends_at') || undefined,
        max_uses: I('max_uses'), scope: S('scope') || 'all',
        collectionIds: fd.getAll('collections').map(String),
        bookIds: J('bookIds'), userIds: J('userIds'),
        active: fd.get('active') === 'on'
      });
    } catch {
      return fail(400, { error: 'Enregistrement impossible — ce code existe peut-être déjà.' });
    }
    throw redirect(303, withFlash(`/admin/promos/${id}`, 'Code enregistré.', 'success'));
  },

  delete: async ({ params, locals }) => {
    requireStaff(locals);
    const id = params.id;
    if (id && id !== 'nouveau') await deletePromo(id);
    throw redirect(303, withFlash('/admin/promos', 'Code supprimé.', 'success'));
  }
};
