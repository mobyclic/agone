import { fail, type Actions } from '@sveltejs/kit';
import { subscribe, isValidEmail } from '$lib/server/newsletter';

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const fd = await request.formData();
    const email = String(fd.get('email') ?? '').trim();
    if (!isValidEmail(email)) return fail(400, { error: 'Adresse e-mail invalide.', email });
    const first_name = String(fd.get('first_name') ?? '').trim() || undefined;
    await subscribe({
      email,
      first_name,
      userId: locals.user?.id,
      source: String(fd.get('source') ?? 'site')
    });
    return { ok: true };
  }
};
