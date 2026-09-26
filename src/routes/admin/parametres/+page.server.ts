import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { getSetting, setSetting } from '$lib/server/site';
import { getCompany } from '$lib/server/invoice';
import { wpConfigured } from '$lib/server/wp-db';
import { lancerSynchro } from '$lib/server/sync-job';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async () => {
  const [contact, banner, company, tracking, syncState, stock] = await Promise.all([
    getSetting('contact'), getSetting('banner'), getCompany(), getSetting('tracking'), getSetting('sync_state'), getSetting('stock')
  ]);
  const c = (contact ?? {}) as Record<string, any>;
  const b = (banner ?? {}) as Record<string, any>;
  const t = (tracking ?? {}) as Record<string, any>;
  const msg = b.message;
  return {
    wpReady: wpConfigured(),
    contact: { email: String(c.email ?? ''), phone: String(c.phone ?? ''), address: String(c.address ?? '') },
    banner: {
      active: b.active === true,
      message: typeof msg === 'object' && msg ? String(msg.fr ?? '') : String(msg ?? ''),
      variant: typeof b.variant === 'string' ? b.variant : 'info'
    },
    tracking: { gtm_id: String(t.gtm_id ?? ''), ga_id: String(t.ga_id ?? ''), meta_pixel_id: String(t.meta_pixel_id ?? '') },
    syncState: (syncState ?? {}) as Record<string, any>,
    stock: { alert_threshold: Number((stock as any)?.alert_threshold ?? 10) },
    company
  };
};

export const actions: Actions = {
  contact: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    await setSetting('contact', {
      email: String(fd.get('email') ?? '').trim(),
      phone: String(fd.get('phone') ?? '').trim(),
      address: String(fd.get('address') ?? '').trim()
    });
    throw redirect(303, withFlash('/admin/parametres', 'Coordonnées enregistrées.', 'success'));
  },

  /** Seuil d'alerte de stock : au-dessous, le livre est signalé au réassort. */
  stock: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const n = Number(String(fd.get('alert_threshold') ?? '').replace(',', '.'));
    await setSetting('stock', { alert_threshold: Number.isFinite(n) && n >= 0 ? Math.round(n) : 10 });
    throw redirect(303, withFlash('/admin/parametres', 'Seuil d’alerte enregistré.', 'success'));
  },

  tracking: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    await setSetting('tracking', {
      gtm_id: String(fd.get('gtm_id') ?? '').trim(),
      ga_id: String(fd.get('ga_id') ?? '').trim(),
      meta_pixel_id: String(fd.get('meta_pixel_id') ?? '').trim()
    });
    throw redirect(303, withFlash('/admin/parametres', 'Traceurs enregistrés.', 'success'));
  },

  banner: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    await setSetting('banner', {
      active: fd.get('active') === 'on',
      message: String(fd.get('message') ?? '').trim(),
      variant: String(fd.get('variant') ?? 'info')
    });
    throw redirect(303, withFlash('/admin/parametres', 'Bannière enregistrée.', 'success'));
  },

  billing: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const S = (k: string) => String(fd.get(k) ?? '').trim();
    const vatRates = S('vat_rates')
      .split(',')
      .map((x) => Number(x.trim().replace(',', '.')))
      .filter((n) => !Number.isNaN(n) && n >= 0);
    await setSetting('billing', {
      legal_name: S('legal_name'), address: S('address'), siret: S('siret'), vat_number: S('vat_number'),
      rcs: S('rcs'), ape: S('ape'), iban: S('iban'), bic: S('bic'), email: S('email'), phone: S('phone'),
      capital: S('capital'), footer: S('footer'),
      vat_rate: S('vat_rate') ? Number(S('vat_rate').replace(',', '.')) : 5.5,
      vat_rates: vatRates.length ? [...new Set(vatRates)] : [5.5, 20, 10, 2.1, 0]
    });
    throw redirect(303, withFlash('/admin/parametres', 'Informations de facturation enregistrées.', 'success'));
  },

  /**
   * Tout synchroniser : lancé EN TÂCHE DE FOND (plusieurs minutes possibles — une
   * requête qui attendait la fin se faisait couper par le proxy : « upstream error »).
   * La page suit l'avancement via /admin/api/sync.
   */
  syncTout: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const job = lancerSynchro({
      limit: Math.max(50, Math.min(5000, Number(fd.get('limit') ?? 1000) || 1000)),
      dryRun: fd.get('dryRun') === 'on',
      full: fd.get('full') === 'on'
    });
    return { syncLancee: job.id };
  }
};
