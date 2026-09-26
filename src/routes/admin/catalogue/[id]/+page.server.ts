import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import {
  getBookAdmin, upsertBook, setBookContributors, deleteBook, allCollections, allRubriques, allBookKeywords, resoudreLivreAdmin,
  ebookAssetsForBook, ajouterEbookAsset, supprimerEbookAsset, type BookInput
} from '$lib/server/catalogue';
import { ventesParExerciceLivre } from '$lib/server/droits';
import { isAdmin } from '$lib/roles';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ params, locals }) => {
  const [collections, rubriques, allKeywords] = await Promise.all([allCollections(), allRubriques(), allBookKeywords()]);
  if (params.id === 'nouveau') {
    return { isNew: true, book: null, contributors: [], collections, rubriques, allKeywords, ebooks: [], ventes: [] };
  }
  // Adresse lisible : /admin/catalogue/<slug>. Les anciens liens par id redirigent.
  const livre = await resoudreLivreAdmin(params.id);
  if (!livre) throw error(404, { message: 'Livre introuvable' });
  if (livre.slug && params.id !== livre.slug) throw redirect(301, `/admin/catalogue/${livre.slug}`);
  const data = await getBookAdmin(livre.id);
  if (!data) throw error(404, { message: 'Livre introuvable' });
  const contributors = (data.contributors ?? []).map((c: any) => ({
    authorId: String(c.author_id),
    authorName: c.author_name,
    authorSlug: c.author_slug,
    role: c.role,
    share: c.share ?? 100
  }));
    // Ventes par exercice : chiffres de droits d'auteur, réservés aux administrateurs.
  const ventes = isAdmin(locals.user?.role) ? await ventesParExerciceLivre(livre.id) : [];
  return { isNew: false, book: data.book, contributors, collections, rubriques, allKeywords, ebooks: await ebookAssetsForBook(livre.id), ventes };
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

    // Un livre n'a qu'une seule collection : elle sert de collection principale ET de membre.
    const collectionId = S('primary_collection') || undefined;

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
      subscription_end: S('subscription_end') || undefined,
      published_at: S('published_at') || undefined,
      page_count: N('page_count'),
      width_cm: N('width_cm'),
      height_cm: N('height_cm'),
      weight_grams: N('weight_grams'),
      stock_qty: N('stock_qty') ?? 0,
      featured: fd.get('featured') === 'on',
      slug: S('slug') || undefined,
      // « a, b ; c » → ['a','b','c'] (dédoublonné sans tenir compte de la casse).
      keywords: [...new Map(S('keywords').split(/[,;\n]/).map((k) => k.trim()).filter(Boolean).map((k) => [k.toLowerCase(), k])).values()],
      collectionIds: collectionId ? [collectionId] : [],
      rubriqueIds: fd.getAll('rubriques').map(String),
      primaryCollectionId: collectionId,
      coverId: S('coverId') || undefined,
      galleryIds
    };

    const editId = params.id && params.id !== 'nouveau' ? ((await resoudreLivreAdmin(params.id))?.id ?? null) : null;
    if (params.id !== 'nouveau' && !editId) return fail(404, { error: 'Livre introuvable.' });
    const id = await upsertBook(editId, input);
    let contribs: { authorId: string; role: string; share?: number }[] = [];
    try { contribs = JSON.parse(S('contributors') || '[]'); } catch { /* noop */ }
    await setBookContributors(id, contribs);

    const apres = await resoudreLivreAdmin(id);
    throw redirect(303, withFlash(`/admin/catalogue/${apres?.slug ?? id}`, 'Livre enregistré.', 'success'));
  },

  /** Dépôt d'un fichier ebook (ePub/PDF) — servi uniquement aux acheteurs. */
  ebook: async ({ request, params, locals }) => {
    requireStaff(locals);
    const livre = params.id && params.id !== 'nouveau' ? await resoudreLivreAdmin(params.id) : null;
    if (!livre) return fail(404, { ebookError: 'Livre introuvable.' });
    const fd = await request.formData();
    const file = fd.get('file');
    if (!(file instanceof File) || !file.size) return fail(400, { ebookError: 'Choisissez un fichier.' });
    const ext = (file.name.split('.').pop() ?? '').toLowerCase();
    if (!['epub', 'pdf'].includes(ext)) return fail(400, { ebookError: 'Format accepté : .epub ou .pdf.' });
    if (file.size > 60 * 1024 * 1024) return fail(400, { ebookError: 'Fichier trop lourd (60 Mo maximum).' });
    await ajouterEbookAsset(livre.id, file);
    throw redirect(303, withFlash(`/admin/catalogue/${livre.slug}`, 'Fichier ebook déposé.', 'success'));
  },

  /** Retrait d'un fichier ebook (les bibliothèques clientes perdent l'accès). */
  ebookSupprimer: async ({ request, params, locals }) => {
    requireStaff(locals);
    const livre = params.id && params.id !== 'nouveau' ? await resoudreLivreAdmin(params.id) : null;
    const fd = await request.formData();
    const assetId = String(fd.get('assetId') ?? '');
    if (assetId) await supprimerEbookAsset(assetId);
    throw redirect(303, withFlash(`/admin/catalogue/${livre?.slug ?? params.id}`, 'Fichier ebook retiré.', 'success'));
  },

  delete: async ({ params, locals }) => {
    requireStaff(locals);
    const livre = params.id && params.id !== 'nouveau' ? await resoudreLivreAdmin(params.id) : null;
    if (livre) await deleteBook(livre.id);
    throw redirect(303, withFlash('/admin/catalogue', 'Livre supprimé.', 'success'));
  }
};
