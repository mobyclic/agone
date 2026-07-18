import { redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import { listCollectionsAdmin, reorderCollections } from '$lib/server/catalogue';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async () => {
  return { collections: await listCollectionsAdmin() };
};

export const actions: Actions = {
  reorder: async ({ request, locals }) => {
    requireStaff(locals);
    const fd = await request.formData();
    let ids: string[] = [];
    try {
      const parsed = JSON.parse(String(fd.get('order') ?? '[]'));
      ids = Array.isArray(parsed) ? parsed.map((x) => String(x)).filter(Boolean) : [];
    } catch {
      ids = [];
    }
    if (ids.length) await reorderCollections(ids);
    throw redirect(303, withFlash('/admin/collections', 'Ordre des collections enregistré.', 'success'));
  }
};
