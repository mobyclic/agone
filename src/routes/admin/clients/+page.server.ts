import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { query, recId } from '$lib/server/surreal';
import { requireAdmin } from '$lib/server/access';
import { createUser, findUserByEmail } from '$lib/server/account';
import { listClientsPro, KINDS_CLIENT, ensureClientWeb } from '$lib/server/clients';
import { withFlash } from '$lib/toasts';

const LIMIT = 50;

// Statuts de commande qui valent achat (même définition que les statistiques).
const PAYEES = ['completed', 'paid', 'processing', 'sent_to_bl'];

export const load: PageServerLoad = async ({ url }) => {
  const q = url.searchParams.get('q')?.trim().toLowerCase() || undefined;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const type = url.searchParams.get('type') === 'pro' ? 'pro' : 'web';

  // ── Clients pro : visibles dans la liste « pro » (facturés) ──
  if (type === 'pro') {
    const kind = url.searchParams.get('kind') || undefined;
    const { clients, total } = await listClientsPro({ liste: 'pro', q, kind, limit: LIMIT, offset: (page - 1) * LIMIT });
    return { type, clients, total, q, kind, kinds: KINDS_CLIENT, page, limit: LIMIT, filtreAchat: false, min: 0, livre: null, auteur: null };
  }

  // ── Clients web : le registre (acheteurs du site, entrés à leur première commande payée) ──
  // Filtres d'achat : un livre, un auteur (tous ses livres), un nombre minimal de commandes — via le compte lié.
  const livre = url.searchParams.get('livre') || undefined;
  const auteur = url.searchParams.get('auteur') || undefined;
  const min = Math.max(0, Number(url.searchParams.get('min') ?? 0) || 0);
  let userIds: string[] | undefined;
  const filtreAchat = !!(livre || auteur || min > 0);
  if (filtreAchat) {
    let ids: Set<string> | null = null;
    const inter = (liste: string[]) => {
      const s = new Set(liste.filter(Boolean).map((x) => String(x).replace(/^user:/, '')));
      ids = ids ? new Set([...ids].filter((x) => s.has(x))) : s;
    };
    if (livre) inter(await query<string>(`SELECT VALUE in.customer FROM contains WHERE out = $b AND in.customer != NONE AND in.status IN $payees`, { b: recId('book', livre), payees: PAYEES }));
    if (auteur) inter(await query<string>(`SELECT VALUE in.customer FROM contains WHERE in.customer != NONE AND in.status IN $payees AND $a INSIDE out->contributed_by[WHERE role = 'author'].out`, { a: recId('author', auteur), payees: PAYEES }));
    if (min > 0) {
      const rows = await query<any>(`SELECT customer, count() AS n FROM order WHERE customer != NONE AND status IN $payees GROUP BY customer`, { payees: PAYEES });
      inter(rows.filter((r) => (r.n ?? 0) >= min).map((r) => r.customer));
    }
    userIds = [...(ids ?? new Set<string>())];
  }
  const [{ clients, total }, livreL, auteurL] = await Promise.all([
    listClientsPro({ liste: 'web', q, userIds, limit: LIMIT, offset: (page - 1) * LIMIT }),
    livre ? query<any>(`SELECT VALUE title FROM $id`, { id: recId('book', livre) }) : Promise.resolve([]),
    auteur ? query<any>(`SELECT VALUE full_name FROM $id`, { id: recId('author', auteur) }) : Promise.resolve([])
  ]);
  return {
    type, clients, total, q, kind: undefined, kinds: KINDS_CLIENT, page, limit: LIMIT, filtreAchat, min,
    livre: livre ? { id: livre, label: livreL[0] ?? livre } : null,
    auteur: auteur ? { id: auteur, label: auteurL[0] ?? auteur } : null
  };
};

export const actions: Actions = {
  // Ajout manuel d'un client particulier (nom/prénom requis, e-mail unique).
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
    const id = await createUser({ email, first_name: first, last_name: last, role: 'customer' });
    await ensureClientWeb(id);
    throw redirect(303, withFlash(`/admin/utilisateurs/${id}`, 'Client créé.', 'success'));
  }
};
