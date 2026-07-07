import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff, requireAdmin } from '$lib/server/access';
import { getSetting, setSetting } from '$lib/server/site';
import { getCompany } from '$lib/server/invoice';
import { wpConfigured } from '$lib/server/wp-db';
import {
  importUsers, importOrders, importAuthors, importArticles, importBooks, importEvents,
  type ImportResult
} from '$lib/server/migration';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async () => {
  const [contact, banner, company] = await Promise.all([getSetting('contact'), getSetting('banner'), getCompany()]);
  const c = (contact ?? {}) as Record<string, any>;
  const b = (banner ?? {}) as Record<string, any>;
  const msg = b.message;
  return {
    wpReady: wpConfigured(),
    contact: { email: String(c.email ?? ''), phone: String(c.phone ?? ''), address: String(c.address ?? '') },
    banner: {
      active: b.active === true,
      message: typeof msg === 'object' && msg ? String(msg.fr ?? '') : String(msg ?? ''),
      variant: typeof b.variant === 'string' ? b.variant : 'info'
    },
    company
  };
};

async function runSync(
  fn: (o: { limit?: number; dryRun?: boolean }) => Promise<ImportResult>,
  fd: FormData
) {
  const limit = Math.max(1, Math.min(5000, Number(fd.get('limit') ?? 200) || 200));
  const dryRun = fd.get('dryRun') === 'on';
  try {
    const result = await fn({ limit, dryRun });
    return { sync: result };
  } catch (e) {
    return fail(500, { syncError: e instanceof Error ? e.message : 'Échec de la synchronisation.' });
  }
}

export const actions: Actions = {
  contact: async ({ request, locals }) => {
    requireStaff(locals);
    const fd = await request.formData();
    await setSetting('contact', {
      email: String(fd.get('email') ?? '').trim(),
      phone: String(fd.get('phone') ?? '').trim(),
      address: String(fd.get('address') ?? '').trim()
    });
    throw redirect(303, withFlash('/admin/parametres', 'Coordonnées enregistrées.', 'success'));
  },

  banner: async ({ request, locals }) => {
    requireStaff(locals);
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

  syncUsers: async ({ request, locals }) => { requireStaff(locals); return runSync(importUsers, await request.formData()); },
  syncOrders: async ({ request, locals }) => { requireStaff(locals); return runSync(importOrders, await request.formData()); },
  syncAuthors: async ({ request, locals }) => { requireStaff(locals); return runSync(importAuthors, await request.formData()); },
  syncArticles: async ({ request, locals }) => { requireStaff(locals); return runSync(importArticles, await request.formData()); },
  syncBooks: async ({ request, locals }) => { requireStaff(locals); return runSync(importBooks, await request.formData()); },
  syncEvents: async ({ request, locals }) => { requireStaff(locals); return runSync(importEvents, await request.formData()); }
};
