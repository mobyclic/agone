import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { getCanal } from '$lib/server/canaux';
import { lireTableur, lectureEnAttente, appliquerCorrespondance, CHAMPS, type Champ } from '$lib/server/importTableur';
import { createReport, addSalesLines } from '$lib/server/droits';
import { withFlash } from '$lib/toasts';
import { journaliser } from '$lib/server/journal';

export const load: PageServerLoad = async ({ params, locals }) => {
  requireAdmin(locals);
  const canal = await getCanal(params.code);
  if (!canal) throw error(404, { message: 'Canal introuvable' });
  if (canal.mode !== 'manuel') throw error(400, { message: 'Ce canal est alimenté par une API, pas par un tableur.' });
  return { canal, champs: CHAMPS };
};

export const actions: Actions = {
  /** Premier temps : lecture du fichier et proposition de correspondance. */
  lire: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const file = fd.get('file');
    if (!(file instanceof File) || !file.size) return fail(400, { error: 'Déposez un fichier xlsx, xls ou csv.' });
    if (file.size > 20 * 1024 * 1024) return fail(400, { error: 'Fichier trop lourd (20 Mo maximum).' });
    try {
      const l = lireTableur(Buffer.from(await file.arrayBuffer()), file.name, String(fd.get('feuille') ?? '') || undefined);
      const { lignes: _l, ...sansLignes } = l;
      return { lecture: { ...sansLignes, nbLignes: l.lignes.length } };
    } catch (e) {
      return fail(400, { error: `Lecture impossible : ${e instanceof Error ? e.message : 'format non reconnu'}` });
    }
  },

  /** Second temps : correspondance validée, création du relevé. */
  importer: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const canal = await getCanal(params.code!);
    if (!canal) throw error(404, { message: 'Canal introuvable' });
    const fd = await request.formData();
    const lecture = lectureEnAttente(String(fd.get('token') ?? ''));
    if (!lecture) return fail(400, { error: 'Le fichier lu a expiré : redéposez-le.' });
    const start = String(fd.get('period_start') ?? ''), end = String(fd.get('period_end') ?? '');
    if (!start || !end) return fail(400, { error: 'Indiquez la période couverte par ce relevé.' });
    const mapping: Record<number, Champ> = {};
    lecture.entetes.forEach((_, i) => {
      const v = String(fd.get(`col_${i}`) ?? 'ignore') as Champ;
      if (v !== 'ignore') mapping[i] = v;
    });
    const champs = new Set(Object.values(mapping));
    if (!champs.has('isbn') || !champs.has('units_sold')) return fail(400, { error: 'Il faut au moins une colonne ISBN et une colonne d’exemplaires vendus.' });
    const formatDefaut = String(fd.get('format') ?? 'paper') === 'ebook' ? 'ebook' : 'paper';
    const { lignes, sansIsbn } = appliquerCorrespondance(lecture, mapping, formatDefaut);
    if (!lignes.length) return fail(400, { error: 'Aucune ligne exploitable : vérifiez la colonne ISBN.' });

    const reportId = await createReport({
      channelId: canal.id, period_start: start, period_end: end,
      label: String(fd.get('label') ?? '').trim() || lecture.nomFichier
    });
    const r = await addSalesLines(reportId, lignes);
    await journaliser(locals, { action: 'releve.importe', cible: { type: 'sales_report', id: reportId, libelle: `${canal.name} ${start} → ${end}` }, details: { fichier: lecture.nomFichier, lignes: r.inserees, isbn_inconnus: r.inconnus.length, sans_isbn: sansIsbn } });
    const reserves = [
      r.inconnus.length ? `${r.inconnus.length} ISBN absents du catalogue (lignes gardées, sans livre)` : '',
      sansIsbn ? `${sansIsbn} ligne(s) sans ISBN ignorée(s)` : ''
    ].filter(Boolean).join(' · ');
    throw redirect(303, withFlash('/admin/droits/ventes', `Relevé importé : ${r.inserees} ligne(s).${reserves ? ` ${reserves}.` : ''}`, r.inconnus.length ? 'info' : 'success'));
  }
};
