import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { ensureCanaux, listCanaux, upsertCanal, setCanalEnabled, deleteCanal } from '$lib/server/canaux';
import { query } from '$lib/server/surreal';
import { withFlash } from '$lib/toasts';
import { journaliser } from '$lib/server/journal';

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals);
  await ensureCanaux();
  const [canaux, releves] = await Promise.all([
    listCanaux(),
    // math::max ne s'applique pas aux dates : on relit les fins de période et on garde la plus tardive.
    query<any>(`SELECT channel.code AS code, period_end FROM sales_report`)
  ]);
  const parCode: Record<string, { n: number; dernier?: string }> = {};
  for (const r of releves) {
    if (!r.code) continue;
    const e = parCode[r.code] ?? (parCode[r.code] = { n: 0 });
    e.n++;
    if (r.period_end && (!e.dernier || new Date(r.period_end) > new Date(e.dernier))) e.dernier = String(r.period_end);
  }
  return { canaux, releves: parCode };
};

const lire = (fd: FormData) => {
  const S = (k: string) => String(fd.get(k) ?? '').trim();
  return {
    code: S('code'), name: S('name'), family: S('family'), mode: S('mode'),
    connector: S('connector') || undefined, order_channel: S('order_channel') || undefined,
    enabled: fd.get('enabled') !== 'off',
    color: S('color') || undefined, sort: Number(S('sort')) || 0,
    physical_via_bldd: fd.get('physical_via_bldd') === 'on', notes: S('notes') || undefined
  };
};

export const actions: Actions = {
  save: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const d = lire(fd);
    if (!d.name) return fail(400, { error: 'Le nom est requis.' });
    try {
      const code = await upsertCanal(d, String(fd.get('existing') ?? '') || undefined);
      await journaliser(locals, { action: 'canal.enregistre', cible: { type: 'sales_channel', id: code, libelle: d.name }, details: { famille: d.family, mode: d.mode, connecteur: d.connector ?? '—' } });
      throw redirect(303, withFlash('/admin/canaux', 'Canal enregistré.', 'success'));
    } catch (e) {
      if ((e as any)?.status === 303) throw e;
      return fail(400, { error: e instanceof Error ? e.message : 'Enregistrement impossible.' });
    }
  },

  toggle: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const code = String(fd.get('code') ?? '');
    const enabled = fd.get('enabled') === 'true';
    if (!code) return fail(400, { error: 'Canal manquant.' });
    await setCanalEnabled(code, enabled);
    await journaliser(locals, { action: enabled ? 'canal.active' : 'canal.desactive', cible: { type: 'sales_channel', id: code, libelle: code } });
    return { ok: true };
  },

  delete: async ({ request, locals }) => {
    requireAdmin(locals);
    const code = String((await request.formData()).get('code') ?? '');
    const r = await deleteCanal(code);
    if (!r.ok) return fail(400, { error: r.error });
    throw redirect(303, withFlash('/admin/canaux', 'Canal supprimé.', 'success'));
  }
};
