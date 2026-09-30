import { fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import { listAuthorsOverview, setAuthorHidden } from '$lib/server/authors';

export const load: PageServerLoad = async () => {
  // Liste complète : recherche, filtres, tri, pagination et export se font côté client.
  return { authors: await listAuthorsOverview() };
};

export const actions: Actions = {
  /** Commutateur visible / masqué, depuis la liste. */
  visibilite: async ({ request, locals }) => {
    requireStaff(locals);
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    if (!id) return fail(400, { error: 'Requête invalide.' });
    await setAuthorHidden(id, fd.get('hidden') === 'true');
    return { ok: true };
  }
};
