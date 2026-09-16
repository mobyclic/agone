import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getPageBySlug, savePage } from '$lib/server/pages';
import { requireStaff } from '$lib/server/access';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ params }) => {
  const page = await getPageBySlug(params.slug);
  if (!page) throw error(404, { message: 'Page introuvable' });
  return { page };
};

export const actions: Actions = {
  /** Édition en place : le staff modifie la page depuis le site public. */
  save: async ({ request, params, locals }) => {
    requireStaff(locals);
    const slug = params.slug;
    if (!slug) throw error(404, { message: 'Page introuvable' });
    const fd = await request.formData();
    const title = String(fd.get('title') ?? '').trim();
    if (!title) return fail(400, { error: 'Le titre est requis.' });
    const ok = await savePage(slug, { title, body_html: String(fd.get('body_html') ?? '') });
    if (!ok) throw error(404, { message: 'Page introuvable' });
    throw redirect(303, withFlash(`/${slug}`, 'Page enregistrée.', 'success'));
  }
};
