import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { query } from '$lib/server/surreal';
import { requireAdmin } from '$lib/server/access';
import { createUser, findUserByEmail } from '$lib/server/account';
import { withFlash } from '$lib/toasts';
import { journaliser } from '$lib/server/journal';

/** Les comptes de la maison : administrateurs et éditeurs. Les clients sont dans « Clients ». */
export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals);
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, email, full_name, first_name, last_name, role, email_verified, is_active, created_at
       FROM user WHERE role IN ['admin','editor'] ORDER BY role ASC, full_name ASC`
  );
  return {
    users: rows.map((r: any) => ({
      id: r.id, email: r.email ?? '', full_name: r.full_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email || '—',
      role: r.role, email_verified: r.email_verified === true, is_active: r.is_active !== false, created_at: r.created_at ?? undefined
    }))
  };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const S = (k: string) => String(fd.get(k) ?? '').trim();
    const email = S('email').toLowerCase();
    const role = S('role') === 'admin' ? 'admin' : 'editor';
    if (!S('first_name') && !S('last_name')) return fail(400, { error: 'Renseignez au moins un nom ou un prénom.' });
    if (!email) return fail(400, { error: 'L’e-mail est requis.' });
    if (await findUserByEmail(email)) return fail(400, { error: 'Un compte existe déjà avec cet e-mail.' });
    const id = await createUser({ email, first_name: S('first_name'), last_name: S('last_name'), role });
    await journaliser(locals, { action: 'utilisateur.cree', cible: { type: 'user', id, libelle: email }, details: { role } });
    throw redirect(303, withFlash(`/admin/utilisateurs/${id}`, 'Compte créé.', 'success'));
  }
};
