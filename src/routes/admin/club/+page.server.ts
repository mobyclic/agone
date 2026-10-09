import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { getClub, setClub, listAdhesions, statsClub, ajouterAdhesion, annulerAdhesion, CLUB_DEFAUT, type ReglagesClub } from '$lib/server/club';
import { journaliser } from '$lib/server/journal';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ url, locals }) => {
  requireAdmin(locals);
  const etat = (['actives', 'expirees', 'toutes'].includes(url.searchParams.get('etat') ?? '') ? url.searchParams.get('etat') : 'actives') as 'actives' | 'expirees' | 'toutes';
  const q = url.searchParams.get('q') ?? '';
  const [club, adhesions, stats] = await Promise.all([getClub(), listAdhesions({ etat, q }), statsClub()]);
  return { club, adhesions, stats, etat, q };
};

const S = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const N = (fd: FormData, k: string, d: number) => { const n = Number(S(fd, k).replace(',', '.')); return S(fd, k) !== '' && Number.isFinite(n) ? n : d; };

export const actions: Actions = {
  reglages: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const r: ReglagesClub = {
      active: fd.get('active') === 'on', nom: S(fd, 'nom') || CLUB_DEFAUT.nom,
      prix_ttc: Math.max(0, N(fd, 'prix_ttc', CLUB_DEFAUT.prix_ttc)), tva: Math.max(0, N(fd, 'tva', CLUB_DEFAUT.tva)),
      remise: Math.min(100, Math.max(0, N(fd, 'remise', CLUB_DEFAUT.remise))), fond_ans: Math.max(0, Math.round(N(fd, 'fond_ans', CLUB_DEFAUT.fond_ans))),
      duree_mois: Math.max(1, Math.round(N(fd, 'duree_mois', CLUB_DEFAUT.duree_mois))),
      franco: S(fd, 'franco') === 'toujours' || S(fd, 'franco') === 'nouveautes' ? (S(fd, 'franco') as 'toujours' | 'nouveautes') : 'non',
      texte: S(fd, 'texte')
    };
    await setClub(r);
    await journaliser(locals, { action: 'club.reglages', cible: { type: 'site_setting', id: 'club', libelle: r.nom } });
    throw redirect(303, withFlash('/admin/club', 'Réglages du club enregistrés.', 'success'));
  },
  ajouter: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const userId = S(fd, 'userId').replace(/^user:/, '');
    if (!userId) return fail(400, { error: 'Choisissez un client.' });
    const source = S(fd, 'source') === 'offert' ? 'offert' : 'manuel';
    try {
      await ajouterAdhesion(userId, {
        source, montant: N(fd, 'montant', NaN) >= 0 ? N(fd, 'montant', NaN) : undefined, methode: S(fd, 'methode') || 'cheque',
        debut: S(fd, 'debut') ? new Date(S(fd, 'debut')) : undefined, note: S(fd, 'note'), facturer: source !== 'offert' && fd.get('facturer') === 'on'
      });
      await journaliser(locals, { action: 'club.adhesion', cible: { type: 'user', id: userId }, details: { source } });
      throw redirect(303, withFlash('/admin/club', source === 'offert' ? 'Adhésion offerte enregistrée.' : 'Adhésion enregistrée.', 'success'));
    } catch (e) {
      if ((e as any)?.status === 303) throw e;
      return fail(400, { error: e instanceof Error ? e.message : 'Enregistrement impossible.' });
    }
  },
  annuler: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const id = S(fd, 'id');
    if (!id) return fail(400, { error: 'Adhésion introuvable.' });
    await annulerAdhesion(id);
    await journaliser(locals, { action: 'club.annulation', cible: { type: 'club_membership', id } });
    throw redirect(303, withFlash('/admin/club', 'Adhésion annulée (la facture éventuelle reste à traiter par un avoir).', 'success'));
  }
};
