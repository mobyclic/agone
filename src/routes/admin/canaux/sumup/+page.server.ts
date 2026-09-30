import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { getCanal } from '$lib/server/canaux';
import {
  etatSumup, listerEncaissements, comptesParEtat, releverEncaissements, rapprocherEnAttente,
  validerEncaissement, ignorerEncaissement, rouvrirEncaissement
} from '$lib/server/sumup';
import { withFlash } from '$lib/toasts';
import { journaliser } from '$lib/server/journal';

const ETATS = ['a_traiter', 'auto', 'valide', 'ignore'];

export const load: PageServerLoad = async ({ url, locals }) => {
  requireAdmin(locals);
  const etat = ETATS.includes(url.searchParams.get('etat') ?? '') ? url.searchParams.get('etat')! : 'a_traiter';
  const [canal, config, encaissements, comptes] = await Promise.all([
    getCanal('sumup'), etatSumup(), listerEncaissements({ etat, limit: 300 }), comptesParEtat()
  ]);
  return { canal, config, etat, encaissements, comptes };
};

const ids = (v: FormDataEntryValue | null): string[] => {
  try { const a = JSON.parse(String(v ?? '[]')); return Array.isArray(a) ? a.map(String).filter(Boolean) : []; } catch { return []; }
};

export const actions: Actions = {
  relever: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const depuis = new Date(String(fd.get('depuis') ?? ''));
    const jusqua = new Date(String(fd.get('jusqua') ?? ''));
    if (isNaN(+depuis) || isNaN(+jusqua) || depuis > jusqua) return fail(400, { error: 'Période invalide.' });
    jusqua.setUTCHours(23, 59, 59, 999);
    try {
      const r = await releverEncaissements(depuis, jusqua);
      await journaliser(locals, { action: 'sumup.releve', cible: { type: 'sales_channel', id: 'sumup', libelle: 'SumUp' }, details: { periode: `${fd.get('depuis')} → ${fd.get('jusqua')}`, ...r } });
      throw redirect(303, withFlash('/admin/canaux/sumup', `${r.lus} encaissements lus, ${r.nouveaux} nouveaux (${r.autos} rapprochés d’office, ${r.aTraiter} à traiter).`, 'success'));
    } catch (e) {
      if ((e as any)?.status === 303) throw e;
      return fail(502, { error: e instanceof Error ? e.message : 'Relevé impossible.' });
    }
  },

  relancer: async ({ locals }) => {
    requireAdmin(locals);
    const r = await rapprocherEnAttente();
    throw redirect(303, withFlash('/admin/canaux/sumup', `${r.examines} encaissements réexaminés, ${r.autos} rapprochés.`, 'success'));
  },

  valider: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    if (!id) return fail(400, { error: 'Encaissement manquant.' });
    const s = String(fd.get('suggestion') ?? '');
    try {
      await validerEncaissement(id, {
        suggestion: s === '' ? undefined : Number(s),
        bookIds: ids(fd.get('bookIds')), qty: Number(fd.get('qty') ?? 1) || 1, note: String(fd.get('note') ?? '').trim() || undefined
      });
      await journaliser(locals, { action: 'sumup.valide', cible: { type: 'sumup_transaction', id, libelle: 'Encaissement SumUp' } });
    } catch (e) {
      return fail(400, { error: e instanceof Error ? e.message : 'Validation impossible.' });
    }
    return { ok: true };
  },

  ignorer: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    if (!id) return fail(400, { error: 'Encaissement manquant.' });
    await ignorerEncaissement(id, String(fd.get('note') ?? '').trim() || undefined);
    await journaliser(locals, { action: 'sumup.ignore', cible: { type: 'sumup_transaction', id, libelle: 'Encaissement SumUp' } });
    return { ok: true };
  },

  rouvrir: async ({ request, locals }) => {
    requireAdmin(locals);
    const id = String((await request.formData()).get('id') ?? '');
    if (id) await rouvrirEncaissement(id);
    return { ok: true };
  }
};
