import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { query, recId } from '$lib/server/surreal';
import { requireAdmin } from '$lib/server/access';
import { createUser, findUserByEmail } from '$lib/server/account';
import { withFlash } from '$lib/toasts';

const LIMIT = 50;

export const load: PageServerLoad = async ({ url }) => {
  const q = url.searchParams.get('q')?.trim().toLowerCase() || undefined;
  const role = url.searchParams.get('role') || undefined;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);

  // On masque les comptes sans identité (ni nom ni prénom → full_name vide).
  const where: string[] = ["full_name != ''"];
  const vars: Record<string, unknown> = { limit: LIMIT, start: (page - 1) * LIMIT };
  if (role) { where.push('role = $role'); vars.role = role; }
  if (q) { where.push('(string::lowercase(email ?? "") CONTAINS $q OR string::lowercase(full_name) CONTAINS $q)'); vars.q = q; }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const rows = await query<any>(
    `SELECT meta::id(id) AS pid, email, full_name, first_name, last_name, role, email_verified, created_at, legacy_wp_id
       FROM user ${whereSql} ORDER BY created_at DESC LIMIT $limit START $start`,
    vars
  );
  const count = await query<any>(`SELECT count() AS n FROM user ${whereSql} GROUP ALL`, vars);

  // Nombre de commandes par utilisateur affiché.
  const orderCounts = new Map<string, number>();
  if (rows.length) {
    const ids = rows.map((r) => recId('user', r.pid));
    const oc = await query<any>(`SELECT customer, count() AS n FROM order WHERE customer IN $ids GROUP BY customer`, { ids });
    for (const r of oc) if (r.customer) orderCounts.set(String(r.customer).replace(/^user:/, ''), r.n ?? 0);
  }

  const roleStats = await query<any>(`SELECT role, count() AS n FROM user GROUP BY role`);
  const byRole: Record<string, number> = {};
  for (const r of roleStats) byRole[r.role] = r.n ?? 0;

  const users = rows.map((r) => ({
    id: r.pid,
    email: r.email ?? '',
    full_name: r.full_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || '—',
    role: r.role ?? 'customer',
    email_verified: r.email_verified === true,
    created_at: r.created_at ?? undefined,
    legacy: r.legacy_wp_id != null,
    orders: orderCounts.get(r.pid) ?? 0
  }));

  return { users, total: count[0]?.n ?? 0, byRole, q, role, page, limit: LIMIT };
};

export const actions: Actions = {
  // Ajout manuel d'un utilisateur (nom/prénom requis, e-mail unique).
  create: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const S = (k: string) => String(fd.get(k) ?? '').trim();
    const first = S('first_name');
    const last = S('last_name');
    const email = S('email').toLowerCase();
    if (!first && !last) return fail(400, { error: 'Renseignez au moins un nom ou un prénom.' });
    if (!email) return fail(400, { error: 'L’e-mail est requis.' });
    if (await findUserByEmail(email)) return fail(400, { error: 'Un compte existe déjà avec cet e-mail.' });
    const id = await createUser({ email, first_name: first, last_name: last, role: S('role') || 'customer' });
    throw redirect(303, withFlash(`/admin/utilisateurs/${id}`, 'Utilisateur créé.', 'success'));
  }
};
