import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import { isAdmin } from '$lib/roles';
import { getAuthorAdminBySlug, upsertAuthor, deleteAuthor, type AuthorInput } from '$lib/server/authors';
import { statementsForAuthor } from '$lib/server/droits';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ params, locals }) => {
  if (params.slug === 'nouveau') return { isNew: true, author: null, statements: [] };
  const author = await getAuthorAdminBySlug(params.slug);
  if (!author) throw error(404, { message: 'Auteur introuvable' });
  // Droits d'auteur : réservés aux administrateurs.
  const statements = isAdmin(locals.user?.role) ? await statementsForAuthor(author.pid) : [];
  return { isNew: false, author, statements };
};

export const actions: Actions = {
  save: async ({ request, params, locals }) => {
    requireStaff(locals);
    const fd = await request.formData();
    const S = (k: string) => (fd.get(k) ? String(fd.get(k)).trim() : '');

    if (!S('first_name') && !S('last_name')) return fail(400, { error: 'Un nom est requis.' });

    const input: AuthorInput = {
      first_name: S('first_name'),
      last_name: S('last_name'),
      bio_html: S('bio_html') || undefined,
      portraitId: S('portraitId') || undefined,
      hidden: fd.get('hidden') === 'on',
      nationality: S('nationality') || undefined,
      birth_date: S('birth_date') || undefined,
      death_date: S('death_date') || undefined,
      website: S('website') || undefined,
      legal_name: S('legal_name') || undefined,
      siret: S('siret') || undefined
    };

    let editId: string | null = null;
    if (params.slug && params.slug !== 'nouveau') {
      const existing = await getAuthorAdminBySlug(params.slug);
      if (!existing) throw error(404, { message: 'Auteur introuvable' });
      editId = existing.pid;
    }
    const { slug } = await upsertAuthor(editId, input);
    throw redirect(303, withFlash(`/admin/auteurs/${slug}`, 'Auteur enregistré.', 'success'));
  },

  delete: async ({ params, locals }) => {
    requireStaff(locals);
    const slug = params.slug;
    if (!slug || slug === 'nouveau') throw redirect(303, '/admin/auteurs');
    const existing = await getAuthorAdminBySlug(slug);
    if (!existing) throw redirect(303, '/admin/auteurs');
    try {
      await deleteAuthor(existing.pid);
    } catch (e) {
      if (e instanceof Error && e.message === 'AUTHOR_HAS_BOOKS') {
        throw redirect(303, withFlash(`/admin/auteurs/${slug}`, 'Suppression impossible : cet auteur a des titres.', 'error'));
      }
      throw e;
    }
    throw redirect(303, withFlash('/admin/auteurs', 'Auteur supprimé.', 'success'));
  }
};
