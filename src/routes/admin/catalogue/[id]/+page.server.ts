import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import {
  getBookAdmin, upsertBook, setBookContributors, deleteBook, allCollections, allRubriques, type BookInput
} from '$lib/server/catalogue';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ params }) => {
  const [collections, rubriques] = await Promise.all([allCollections(), allRubriques()]);
  if (params.id === 'nouveau') {
    return { isNew: true, book: null, contributors: [], collections, rubriques };
  }
  const data = await getBookAdmin(params.id);
  if (!data) throw error(404, { message: 'Livre introuvable' });
  const contributors = (data.contributors ?? []).map((c: any) => ({
    authorId: String(c.author_id),
    authorName: c.author_name,
    role: c.role,
    share: c.share ?? 100
  }));
  return { isNew: false, book: data.book, contributors, collections, rubriques };
};

export const actions: Actions = {
  save: async ({ request, params, locals }) => {
    requireStaff(locals);
    const fd = await request.formData();
    const S = (k: string) => (fd.get(k) ? String(fd.get(k)).trim() : '');
    const N = (k: string) => { const v = S(k); return v === '' ? undefined : Number(v.replace(',', '.')); };

    const title = S('title');
    if (!title) return fail(400, { error: 'Le titre est requis.' });

    let galleryIds: string[] = [];
    try {
      const g = JSON.parse(S('galleryIds') || '[]');
      galleryIds = Array.isArray(g) ? g.map(String).filter(Boolean) : [];
    } catch {
      galleryIds = [];
    }

    const input: BookInput = {
      title,
      subtitle: S('subtitle') || undefined,
      description_html: S('description_html') || undefined,
      extra_info_html: S('extra_info_html') || undefined,
      title_original: S('title_original') || undefined,
      language_original: S('language_original') || undefined,
      status: S('status') || 'draft',
      isbn_paper: S('isbn_paper') || undefined,
      isbn_ebook: S('isbn_ebook') || undefined,
      price_paper: N('price_paper'),
      price_ebook: N('price_ebook'),
      subscription_price: N('subscription_price'),
      published_at: S('published_at') || undefined,
      page_count: N('page_count'),
      width_cm: N('width_cm'),
      height_cm: N('height_cm'),
      stock_qty: N('stock_qty') ?? 0,
      featured: fd.get('featured') === 'on',
      collectionIds: fd.getAll('collections').map(String),
      rubriqueIds: fd.getAll('rubriques').map(String),
      primaryCollectionId: S('primary_collection') || undefined,
      coverId: S('coverId') || undefined,
      galleryIds
    };

    const editId = params.id && params.id !== 'nouveau' ? params.id : null;
    const id = await upsertBook(editId, input);
    let contribs: { authorId: string; role: string; share?: number }[] = [];
    try { contribs = JSON.parse(S('contributors') || '[]'); } catch { /* noop */ }
    await setBookContributors(id, contribs);

    throw redirect(303, withFlash(`/admin/catalogue/${id}`, 'Livre enregistré.', 'success'));
  },

  delete: async ({ params, locals }) => {
    requireStaff(locals);
    if (params.id && params.id !== 'nouveau') await deleteBook(params.id);
    throw redirect(303, withFlash('/admin/catalogue', 'Livre supprimé.', 'success'));
  }
};
