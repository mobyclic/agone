import { redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import { listSubscribers, subscriberStats, seedFromUsers, unsubscribeByEmail } from '$lib/server/newsletter';
import { withFlash } from '$lib/toasts';

const LIMIT = 50;

export const load: PageServerLoad = async ({ url }) => {
  const q = url.searchParams.get('q') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const [{ subscribers, total }, stats] = await Promise.all([
    listSubscribers({ q, status, limit: LIMIT, offset: (page - 1) * LIMIT }),
    subscriberStats()
  ]);
  return { subscribers, total, stats, q, status, page, limit: LIMIT };
};

export const actions: Actions = {
  seed: async ({ locals }) => {
    requireStaff(locals);
    const { added } = await seedFromUsers();
    throw redirect(303, withFlash('/admin/newsletter', `${added} client(s) abonné(s) importé(s).`, 'success'));
  },

  unsubscribe: async ({ request, locals }) => {
    requireStaff(locals);
    const fd = await request.formData();
    const email = String(fd.get('email') ?? '');
    if (email) await unsubscribeByEmail(email);
    throw redirect(303, withFlash('/admin/newsletter', 'Abonné désabonné.', 'success'));
  }
};
