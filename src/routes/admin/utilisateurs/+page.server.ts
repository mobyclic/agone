import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { query, recId } from '$lib/server/surreal';
import { requireAdmin } from '$lib/server/access';
import { createUser, findUserByEmail } from '$lib/server/account';
import { withFlash } from '$lib/toasts';

const LIMIT = 50;

// Statuts de commande qui valent achat (même définition que les statistiques).
const PAYEES = ['completed', 'paid', 'processing', 'sent_to_bl'];

export const load: PageServerLoad = async ({ url }) => {
  const q = url.searchParams.get('q')?.trim().toLowerCase() || undefined;
  const role = url.searchParams.get('role') || undefined;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  // Filtres d'achat : un livre, un auteur (tous ses livres), un nombre minimal de commandes.
  const livre = url.searchParams.get('livre') || undefined;
  const auteur = url.searchParams.get('auteur') || undefined;
  const min = Math.max(0, Number(url.searchParams.get('min') ?? 0) || 0);
  // Comptes sans identité (126 comptes WordPress sans nom ni commande) : masqués par défaut.
  const sansNom = url.searchParams.get('sansnom') === '1';

  const where: string[] = [];
  const vars: Record<string, unknown> = { limit: LIMIT, start: (page - 1) * LIMIT, payees: PAYEES };
  if (!sansNom) where.push("full_name != ''");
  if (role) { where.push('role = $role'); vars.role = role; }
  if (q) { where.push('(string::lowercase(email ?? "") CONTAINS $q OR string::lowercase(full_name) CONTAINS $q)'); vars.q = q; }

  // Acheteurs : ensemble d'ids calculé à part, puis `id IN $acheteurs`.
  let filtreAchat = false;
  if (livre || auteur || min > 0) {
    filtreAchat = true;
    let ids: Set<string> | null = null;
    const inter = (liste: string[]) => {
      const s = new Set(liste.filter(Boolean).map((x) => String(x).replace(/^user:/, '')));
      ids = ids ? new Set([...ids].filter((x) => s.has(x))) : s;
    };
    if (livre) {
      inter(await query<string>(
        `SELECT VALUE in.customer FROM contains WHERE out = $b AND in.customer != NONE AND in.status IN $payees`,
        { b: recId('book', livre), payees: PAYEES }
      ));
    }
    if (auteur) {
      inter(await query<string>(
        `SELECT VALUE in.customer FROM contains
           WHERE in.customer != NONE AND in.status IN $payees
             AND $a INSIDE out->contributed_by[WHERE role = 'author'].out`,
        { a: recId('author', auteur), payees: PAYEES }
      ));
    }
    if (min > 0) {
      const rows = await query<any>(
        `SELECT customer, count() AS n FROM order WHERE customer != NONE AND status IN $payees GROUP BY customer`,
        { payees: PAYEES }
      );
      inter(rows.filter((r) => (r.n ?? 0) >= min).map((r) => r.customer));
    }
    vars.acheteurs = [...(ids ?? new Set<string>())].map((x) => recId('user', x));
    where.push('id IN $acheteurs');
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await query<any>(
    `SELECT meta::id(id) AS pid, email, full_name, first_name, last_name, role, email_verified, created_at, legacy_wp_id
       FROM user ${whereSql} ORDER BY created_at DESC LIMIT $limit START $start`,
    vars
  );
  const count = await query<any>(`SELECT count() AS n FROM user ${whereSql} GROUP ALL`, vars);

  // Commandes (payées / toutes) par utilisateur affiché.
  const orderCounts = new Map<string, number>();
  if (rows.length) {
    const ids = rows.map((r) => recId('user', r.pid));
    const oc = await query<any>(`SELECT customer, count() AS n FROM order WHERE customer IN $ids GROUP BY customer`, { ids });
    for (const r of oc) if (r.customer) orderCounts.set(String(r.customer).replace(/^user:/, ''), r.n ?? 0);
  }

  // Compteurs d'en-tête calculés avec LE MÊME filtre d'identité que la liste :
  // auparavant « 921 comptes » (sans les comptes anonymes) côtoyait « 1045 clients »
  // (avec), d'où l'incohérence apparente.
  const identite = sansNom ? '' : "WHERE full_name != ''";
  const [roleStats, anonymes] = await Promise.all([
    query<any>(`SELECT role, count() AS n FROM user ${identite} GROUP BY role`),
    query<any>(`SELECT count() AS n FROM user WHERE full_name = '' OR full_name = NONE GROUP ALL`)
  ]);
  const byRole: Record<string, number> = {};
  for (const r of roleStats) byRole[r.role] = r.n ?? 0;

  // Libellés des filtres actifs (pour réafficher les combobox).
  const [livreL, auteurL] = await Promise.all([
    livre ? query<any>(`SELECT VALUE title FROM $id`, { id: recId('book', livre) }) : Promise.resolve([]),
    auteur ? query<any>(`SELECT VALUE full_name FROM $id`, { id: recId('author', auteur) }) : Promise.resolve([])
  ]);

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

  return {
    users, total: count[0]?.n ?? 0, byRole, anonymes: anonymes[0]?.n ?? 0, sansNom, filtreAchat,
    q, role, page, limit: LIMIT, min,
    livre: livre ? { id: livre, label: livreL[0] ?? livre } : null,
    auteur: auteur ? { id: auteur, label: auteurL[0] ?? auteur } : null
  };
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
