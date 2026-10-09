import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { getClientPro } from '$lib/server/clients';
import { saveMedia } from '$lib/server/media';
import { journaliser } from '$lib/server/journal';
import { withFlash } from '$lib/toasts';
import {
  stockDepot, mouvementsDepot, listCarnets, remisePour, poserInventaire, poserReassort, commanderReassort,
  lireCarnet, relireCarnet, lectureCarnet, apercuCarnet, validerCarnet, annulerCarnet, KIND_MOUVEMENT
} from '$lib/server/depots';

export const load: PageServerLoad = async ({ params, locals }) => {
  requireAdmin(locals);
  const client = await getClientPro(params.id);
  if (!client?.depositaire) throw error(404, { message: 'Dépôt introuvable' });
  const [stock, mouvements, carnets, remise] = await Promise.all([stockDepot(params.id), mouvementsDepot(params.id), listCarnets(params.id), remisePour(client)]);
  return { client, stock, mouvements, carnets, remise, kinds: KIND_MOUVEMENT };
};

const S = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const dateOu = (v: string, defaut = new Date()) => { const d = v ? new Date(v) : defaut; return Number.isNaN(d.getTime()) ? defaut : d; };

export const actions: Actions = {
  /** Inventaire : les champs compte_<bookId> remplis posent le stock compté. */
  inventaire: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const comptes: { bookId: string; compte: number }[] = [];
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith('compte_') || String(v).trim() === '') continue;
      const n = Number(String(v).replace(',', '.'));
      if (Number.isFinite(n)) comptes.push({ bookId: k.slice(7), compte: n });
    }
    // Titres ajoutés à l'inventaire (nouveaux au dépôt) : lignes JSON [{bookId, compte}].
    try { for (const l of JSON.parse(S(fd, 'ajouts') || '[]')) if (l.bookId && Number.isFinite(Number(l.compte))) comptes.push({ bookId: String(l.bookId), compte: Number(l.compte) }); } catch { /* ignoré */ }
    if (!comptes.length) return fail(400, { error: 'Aucun comptage saisi.' });
    const r = await poserInventaire(params.id, comptes, { at: dateOu(S(fd, 'at')), note: S(fd, 'note') });
    await journaliser(locals, { action: 'depot.inventaire', cible: { type: 'client', id: params.id }, details: r });
    throw redirect(303, withFlash(`/admin/depots/${params.id}`, r.ajustes ? `Inventaire posé : ${r.ajustes} titre${r.ajustes > 1 ? 's' : ''} ajusté${r.ajustes > 1 ? 's' : ''} (${r.ecart > 0 ? '+' : ''}${r.ecart} ex.).` : 'Inventaire conforme : rien à ajuster.', 'success'));
  },

  /** Réassort : lignes JSON [{bookId, qty}] ; une quantité négative est un retour. */
  reassort: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    let lignes: { bookId: string; qty: number }[] = [];
    try { lignes = JSON.parse(S(fd, 'lignes') || '[]'); } catch { /* vide */ }
    lignes = lignes.filter((l) => l?.bookId && Number.isFinite(Number(l.qty)) && Number(l.qty) !== 0).map((l) => ({ bookId: String(l.bookId), qty: Number(l.qty) }));
    if (!lignes.length) return fail(400, { error: 'Aucun titre ni quantité.' });
    if (fd.get('expedier') === 'on') {
      // Expédié par Les Belles Lettres : une commande « depot » à 0 € que l'export EDI enverra.
      try {
        const r = await commanderReassort(params.id, lignes, { at: dateOu(S(fd, 'at')), note: S(fd, 'note') });
        await journaliser(locals, { action: 'depot.reassort_edi', cible: { type: 'client', id: params.id }, details: { commande: r.number, lignes: r.lignes } });
        throw redirect(303, withFlash(`/admin/depots/${params.id}`, `Réassort à expédier : commande n° ${r.number} créée pour Les Belles Lettres (${r.lignes} titre${r.lignes > 1 ? 's' : ''}).`, 'success'));
      } catch (e) {
        if ((e as any)?.status === 303) throw e;
        return fail(400, { error: e instanceof Error ? e.message : 'Commande impossible.' });
      }
    }
    const n = await poserReassort(params.id, lignes, { at: dateOu(S(fd, 'at')), note: S(fd, 'note') });
    await journaliser(locals, { action: 'depot.reassort', cible: { type: 'client', id: params.id }, details: { lignes: n } });
    throw redirect(303, withFlash(`/admin/depots/${params.id}`, `Réassort enregistré : ${n} titre${n > 1 ? 's' : ''}.`, 'success'));
  },

  /** Carnet : lecture du fichier → aperçu (le fichier attend en mémoire sous un jeton). */
  carnet_lire: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const fichier = fd.get('fichier');
    if (!(fichier instanceof File) || !fichier.size) return fail(400, { error: 'Choisissez un fichier xls, xlsx ou csv.' });
    const client = await getClientPro(params.id);
    if (!client) return fail(404, { error: 'Dépôt introuvable.' });
    let lecture;
    try { lecture = lireCarnet(Buffer.from(await fichier.arrayBuffer()), fichier.name); } catch { return fail(400, { error: 'Fichier illisible.' }); }
    const remise = await remisePour(client);
    // Premier regard : si le carnet note un stock début, on propose de s'y aligner.
    const apercu0 = await apercuCarnet(params.id, lecture, remise, false);
    const aligner = apercu0.ecartsDebut > 0;
    return { carnet: { token: lecture.token, nomFichier: lecture.nomFichier, feuilles: lecture.feuilles, feuille: lecture.feuille, apercu: aligner ? await apercuCarnet(params.id, lecture, remise, true) : apercu0 } };
  },

  /** Carnet : même fichier, autre feuille ou autre remise. */
  carnet_relire: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const token = S(fd, 'token');
    const feuille = S(fd, 'feuille');
    const lecture = feuille ? relireCarnet(token, feuille) : lectureCarnet(token);
    if (!lecture) return fail(410, { error: 'Fichier expiré : importez-le de nouveau.' });
    const client = await getClientPro(params.id);
    const remise = S(fd, 'remise') !== '' ? Number(S(fd, 'remise').replace(',', '.')) : await remisePour(client!);
    return { carnet: { token: lecture.token, nomFichier: lecture.nomFichier, feuilles: lecture.feuilles, feuille: lecture.feuille, apercu: await apercuCarnet(params.id, lecture, remise, fd.get('aligner') === 'on') } };
  },

  /** Carnet : validation → relevé de ventes, facture brouillon, mouvements. */
  carnet_valider: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const lecture = lectureCarnet(S(fd, 'token'));
    if (!lecture) return fail(410, { error: 'Fichier expiré : importez-le de nouveau.' });
    const remise = Math.min(100, Math.max(0, Number(S(fd, 'remise').replace(',', '.')) || 0));
    try {
      const media = await saveMedia({ file: new File([new Uint8Array(lecture.buffer)], lecture.nomFichier), folder: 'carnets', kind: 'document' });
      const r = await validerCarnet(params.id, lecture, { label: S(fd, 'label') || lecture.feuille, sold_at: dateOu(S(fd, 'sold_at')), remise, sourceMediaId: media.id, alignerDebut: fd.get('aligner') === 'on' });
      await journaliser(locals, { action: 'depot.carnet', cible: { type: 'carnet', id: r.carnetId, libelle: S(fd, 'label') }, details: { ventes: r.ventes, sp: r.sp, ecarts: r.ecarts, facture: r.invoiceId } });
      const msg = `Carnet validé : ${r.ventes} vendu${r.ventes > 1 ? 's' : ''}${r.sp ? `, ${r.sp} SP` : ''}${r.ecarts ? `, ${r.ecarts} écart${r.ecarts > 1 ? 's' : ''} de stock` : ''}${r.invoiceId ? ' — facture brouillon créée' : ''}.`;
      throw redirect(303, withFlash(`/admin/depots/${params.id}`, msg, 'success'));
    } catch (e) {
      if (e instanceof Response || (e as any)?.status === 303) throw e;
      return fail(400, { error: e instanceof Error ? e.message : 'Validation impossible.' });
    }
  },

  carnet_annuler: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const id = S(fd, 'carnetId');
    try {
      const r = await annulerCarnet(id);
      await journaliser(locals, { action: 'depot.carnet_annule', cible: { type: 'carnet', id } });
      throw redirect(303, withFlash(`/admin/depots/${params.id}`, r.facture_conservee ? 'Carnet annulé ; la facture déjà émise reste à annuler depuis Facturation.' : 'Carnet annulé : relevé, facture brouillon et mouvements retirés.', 'success'));
    } catch (e) {
      if ((e as any)?.status === 303) throw e;
      return fail(400, { error: e instanceof Error ? e.message : 'Annulation impossible.' });
    }
  }
};
