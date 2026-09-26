import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { analyserContrat, type AnalyseContrat } from '$lib/server/contratAnalyse';
import { saveMedia } from '$lib/server/media';
import { upsertContract, type Tier } from '$lib/server/droits';
import { upsertDeal } from '$lib/server/cessions';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals);
  return {};
};

export const actions: Actions = {
  /**
   * Dépôt et lecture : le PDF part au stockage privé (les contrats signés ne
   * sont pas publics) et sa lecture donne une proposition, pas un contrat.
   */
  analyser: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const file = fd.get('file');
    if (!(file instanceof File) || !file.size) return fail(400, { error: 'Déposez un fichier PDF.' });
    if (file.size > 25 * 1024 * 1024) return fail(400, { error: 'Fichier trop lourd (25 Mo maximum).' });

    let analyse: AnalyseContrat;
    try {
      analyse = await analyserContrat(Buffer.from(await file.arrayBuffer()), file.name);
    } catch {
      return fail(500, { error: 'Lecture impossible : ce PDF n’a pas pu être ouvert.' });
    }
    const media = await saveMedia({ file, folder: 'contrats', kind: 'document' });
    return { analyse, mediaId: String(media.id).replace(/^media:/, ''), nomFichier: file.name };
  },

  /** Création effective, à partir de la proposition corrigée par l'opérateur. */
  creer: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const S = (k: string) => String(fd.get(k) ?? '').trim();
    const N = (k: string) => { const v = S(k); return v === '' ? undefined : Number(v.replace(',', '.')); };
    const bookId = S('bookId');
    if (!bookId) return fail(400, { error: 'Choisissez le livre concerné.' });

    let tiers: Tier[] = [];
    try { tiers = JSON.parse(S('tiers') || '[]'); } catch { /* barème à saisir ensuite */ }
    const mediaId = S('mediaId') || undefined;

    // Cession de droits : un seul enregistrement, pas de contrat d'auteur.
    if (S('genre') === 'cession') {
      const id = await upsertDeal({
        bookId,
        direction: S('sens') === 'in' ? 'in' : 'out',
        counterparty: S('contrepartie') || 'À renseigner',
        language: S('langue') || undefined,
        term_years: N('duree_ans'),
        advance: N('avaloir') ?? 0,
        rate_paper: tiers[0]?.rate,
        rate_ebook: N('taux_numerique'),
        notes: `Créé depuis le contrat déposé « ${S('nomFichier')} ».`
      });
      throw redirect(303, withFlash(`/admin/droits/cessions/${id}`, 'Cession créée depuis le contrat.', 'success'));
    }

    // Contrat d'édition ou de traduction : un contrat par contributeur coché,
    // plus un second si le contrat prévoit un taux numérique distinct.
    const auteurs = fd.getAll('auteurId').map(String).filter(Boolean);
    if (!auteurs.length) return fail(400, { error: 'Cochez au moins un contributeur.' });
    const role = S('role') || 'author';
    const part = N('share') ?? (auteurs.length > 1 ? Math.round(100 / auteurs.length) : 100);
    const numerique = N('taux_numerique');
    let n = 0;
    for (const authorId of auteurs) {
      await upsertContract({
        bookId, authorId, role, tiers, scope: numerique ? 'paper' : 'all', base: 'ppht',
        share: part, advance: N('avaloir') ?? 0, status: 'draft',
        notes: `Lu dans le contrat déposé « ${S('nomFichier')} » — à vérifier avant validation.`,
        documentId: mediaId
      });
      n++;
      if (numerique) {
        await upsertContract({
          bookId, authorId, role, tiers: [{ rate: numerique }], scope: 'ebook', base: 'ppht',
          share: part, advance: 0, status: 'draft',
          notes: `Numérique — lu dans « ${S('nomFichier')} ».`,
          documentId: mediaId
        });
        n++;
      }
    }
    throw redirect(303, withFlash(`/admin/droits/contrats/${bookId}`,
      `${n} contrat(s) créé(s) en brouillon — vérifiez le barème puis passez-les en actif.`, 'success'));
  }
};
