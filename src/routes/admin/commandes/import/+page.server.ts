import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { lireTableur, lectureEnAttente } from '$lib/server/importTableur';
import { CHAMPS_COMMANDES, devinerChampCommande, construireCommandes, importerCommandes, type ChampCommande } from '$lib/server/importCommandes';
import { typesCommandeSaisie } from '$lib/server/canaux';
import { heureParisVersDate } from '$lib/dates';
import { withFlash } from '$lib/toasts';
import { journaliser } from '$lib/server/journal';

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals);
  return { types: await typesCommandeSaisie(), champs: CHAMPS_COMMANDES };
};

const mappingDe = (fd: FormData, entetes: string[]) => {
  const mapping: Record<number, ChampCommande> = {};
  entetes.forEach((_, i) => {
    const v = String(fd.get(`col_${i}`) ?? 'ignore') as ChampCommande;
    if (v !== 'ignore') mapping[i] = v;
  });
  return mapping;
};

const optionsDe = (fd: FormData) => {
  const S = (k: string) => String(fd.get(k) ?? '').trim();
  const jour = S('placed_at') || new Date().toISOString().slice(0, 10);
  return {
    channel: S('channel') || 'comptoir', status: S('status') || 'paid', paymentMethod: S('payment_method') || 'sumup',
    eventId: S('eventId') || undefined, placedAt: heureParisVersDate(`${jour}T12:00`) ?? new Date(), silencieux: true
  };
};

export const actions: Actions = {
  /** Premier temps : lecture du fichier, proposition de correspondance. */
  lire: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const file = fd.get('file');
    if (!(file instanceof File) || !file.size) return fail(400, { error: 'Déposez un fichier xlsx, xls ou csv.' });
    if (file.size > 20 * 1024 * 1024) return fail(400, { error: 'Fichier trop lourd (20 Mo maximum).' });
    try {
      const l = lireTableur(Buffer.from(await file.arrayBuffer()), file.name, String(fd.get('feuille') ?? '') || undefined, devinerChampCommande);
      const { lignes: _l, ...sansLignes } = l;
      return { lecture: { ...sansLignes, nbLignes: l.lignes.length } };
    } catch (e) {
      return fail(400, { error: `Lecture impossible : ${e instanceof Error ? e.message : 'format non reconnu'}` });
    }
  },

  /** Second temps : aperçu des commandes qui seraient créées. */
  apercu: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const lecture = lectureEnAttente(String(fd.get('token') ?? ''));
    if (!lecture) return fail(400, { error: 'Le fichier lu a expiré : redéposez-le.' });
    const mapping = mappingDe(fd, lecture.entetes);
    const champs = new Set(Object.values(mapping));
    if (!champs.has('isbn') && !champs.has('title')) return fail(400, { error: 'Il faut une colonne ISBN ou une colonne Titre pour retrouver les livres.' });
    const { commandes, ignorees } = await construireCommandes(lecture, mapping, optionsDe(fd));
    const { lignes: _l, ...sansLignes } = lecture;
    return {
      lecture: { ...sansLignes, nbLignes: lecture.lignes.length },
      apercu: {
        ignorees, nb: commandes.length, total: commandes.reduce((s, c) => s + c.lines.reduce((t, l) => t + l.qty * l.unit_price, 0), 0),
        commandes: commandes.slice(0, 50).map((c) => ({
          cle: c.cle, date: c.date.toISOString(), email: c.email, nom: [c.first_name, c.last_name].filter(Boolean).join(' '), payment: c.payment,
          lignes: c.lines.map((l) => `${l.title}${l.qty > 1 ? ` × ${l.qty}` : ''} (${l.unit_price.toFixed(2).replace('.', ',')} €)`), inconnus: c.inconnus
        }))
      }
    };
  },

  /** Troisième temps : création des commandes. */
  importer: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const lecture = lectureEnAttente(String(fd.get('token') ?? ''));
    if (!lecture) return fail(400, { error: 'Le fichier lu a expiré : redéposez-le.' });
    const mapping = mappingDe(fd, lecture.entetes);
    const o = optionsDe(fd);
    const { commandes, ignorees } = await construireCommandes(lecture, mapping, o);
    if (!commandes.length) return fail(400, { error: 'Aucune commande à créer : vérifiez les colonnes ISBN / titre.' });
    const numeros = await importerCommandes(commandes, o);
    await journaliser(locals, { action: 'commandes.importees', cible: { type: 'order', id: String(numeros[0]), libelle: `${numeros.length} commandes importées` }, details: { fichier: lecture.nomFichier, canal: o.channel, paiement: o.paymentMethod, commandes: numeros.length, lignes_ignorees: ignorees } });
    throw redirect(303, withFlash(`/admin/commandes?type=&status=`, `${numeros.length} commande(s) créée(s) (n° ${numeros[0]} à ${numeros[numeros.length - 1]})${ignorees ? ` · ${ignorees} ligne(s) sans livre reconnu ignorée(s)` : ''}.`, ignorees ? 'info' : 'success'));
  }
};
