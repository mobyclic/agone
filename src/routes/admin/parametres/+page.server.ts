import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import { getSetting, setSetting } from '$lib/server/site';
import { wpConfigured } from '$lib/server/wp-db';
import { importUsers, importOrders, type ImportResult } from '$lib/server/migration';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async () => {
  const [contact, banner] = await Promise.all([getSetting('contact'), getSetting('banner')]);
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
    }
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

  syncUsers: async ({ request, locals }) => {
    requireStaff(locals);
    return runSync(importUsers, await request.formData());
  },

  syncOrders: async ({ request, locals }) => {
    requireStaff(locals);
    return runSync(importOrders, await request.formData());
  }
};
