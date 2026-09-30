import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { getBookLite, bookContributorsWithContracts, upsertContract, deleteContract, getReglagesDroits, setProvisionLivre, type Tier } from '$lib/server/droits';
import { dealsForBook } from '$lib/server/cessions';
import { resoudreLivreAdmin } from '$lib/server/catalogue';
import { listStaff } from '$lib/server/account';
import { query, recId } from '$lib/server/surreal';
import { withFlash } from '$lib/toasts';
import { journaliser } from '$lib/server/journal';

/** L'adresse porte le slug du livre ; un ancien lien par identifiant redirige. */
async function livreDe(param: string | undefined) {
  if (!param) throw error(404, { message: 'Livre introuvable' });
  const livre = await resoudreLivreAdmin(param);
  if (!livre) throw error(404, { message: 'Livre introuvable' });
  return livre;
}

export const load: PageServerLoad = async ({ params, locals }) => {
  const livre = await livreDe(params.bookId);
  if (livre.slug && params.bookId !== livre.slug) throw redirect(301, `/admin/droits/contrats/${livre.slug}`);
  const book = await getBookLite(livre.id);
  if (!book) throw error(404, { message: 'Livre introuvable' });
  const [contributors, reglages, cessions, staff, dernier] = await Promise.all([
    bookContributorsWithContracts(livre.id),
    getReglagesDroits(),
    dealsForBook(livre.id),
    listStaff(),
    // Directeur proposé par défaut : celui du dernier contrat de la même collection, sinon l'utilisateur.
    query<any>(
      `SELECT IF director != NONE THEN meta::id(director) ELSE NONE END AS id, created_at FROM royalty_contract
        WHERE director != NONE AND book.collection = (SELECT VALUE collection FROM ONLY $b)
        ORDER BY created_at DESC LIMIT 1`,
      { b: recId('book', livre.id) }
    )
  ]);
  const directeurDefaut = dernier[0]?.id ?? locals.user?.id ?? '';
  return { book, contributors, reglages, cessions, staff, directeurDefaut, livreId: livre.id };
};

export const actions: Actions = {
  /** Provision sur retours propre à ce livre (vide = défaut global). */
  provision: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const livre = await livreDe(params.bookId);
    const fd = await request.formData();
    const v = String(fd.get('returns_provision_rate') ?? '').trim();
    await setProvisionLivre(livre.id, v === '' ? null : Number(v.replace(',', '.')));
    throw redirect(303, withFlash(`/admin/droits/contrats/${livre.slug}`, 'Provision enregistrée.', 'success'));
  },

  save: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const livre = await livreDe(params.bookId);
    const fd = await request.formData();
    const S = (k: string) => (fd.get(k) ? String(fd.get(k)).trim() : '');
    const N = (k: string) => { const v = S(k); return v === '' ? undefined : Number(v.replace(',', '.')); };
    let tiers: Tier[] = [];
    try { tiers = JSON.parse(S('tiers') || '[]'); } catch { /* noop */ }

    // Le directeur de collection est obligatoire, et doit être de la maison.
    const directorId = S('director');
    const staff = await listStaff();
    if (!directorId || !staff.some((u) => u.id === directorId)) {
      return fail(400, { error: 'Indiquez le directeur de collection : un compte administrateur ou éditeur.' });
    }

    await upsertContract({
      id: S('contractId') || undefined,
      bookId: livre.id,
      authorId: S('authorId'),
      role: S('role') || 'author',
      tiers,
      scope: S('scope') || 'all',
      base: S('base') || 'ppht',
      net_rate: N('net_rate') ?? 60,
      share: N('share') ?? 100,
      rate_after_advance: N('rate_after_advance'),
      cession_share: N('cession_share'),
      advance: N('advance') ?? 0,
      advance_recouped: N('advance_recouped') ?? 0,
      status: S('status') || 'active',
      notes: S('notes') || undefined,
      term_start: S('term_start') || undefined,
      term_end: S('term_end') || undefined,
      tiers_reset: fd.get('tiers_reset') === 'on',
      directorId
    });
    await journaliser(locals, { action: 'contrat.enregistre', cible: { type: 'royalty_contract', id: S('contractId') || 'nouveau', libelle: `Contrat ${S('role') || 'author'}` }, details: { book_id: livre.slug, paliers: tiers, part: N('share') ?? 100, avaloir: N('advance') ?? 0, statut: S('status') || 'active', validite: `${S('term_start') || '…'} → ${S('term_end') || '…'}`, directeur: staff.find((u) => u.id === directorId)?.full_name } });
    throw redirect(303, withFlash(`/admin/droits/contrats/${livre.slug}`, 'Contrat enregistré.', 'success'));
  },

  delete: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const livre = await livreDe(params.bookId);
    const fd = await request.formData();
    const id = String(fd.get('contractId') || '');
    if (id) {
      await deleteContract(id);
      await journaliser(locals, { action: 'contrat.supprime', cible: { type: 'royalty_contract', id, libelle: 'Contrat' }, details: { book_id: livre.slug } });
    }
    throw redirect(303, withFlash(`/admin/droits/contrats/${livre.slug}`, 'Contrat supprimé.', 'success'));
  }
};
