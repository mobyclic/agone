import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/access';
import { query } from '$lib/server/surreal';

/**
 * Recherche globale du back-office : un numéro de commande, un email, un ISBN,
 * un titre, un nom — d'où qu'on soit. Six familles, cinq résultats chacune.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  requireStaff(locals);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return json({ groupes: [] });
  const bas = q.toLowerCase();
  const chiffres = q.replace(/\D/g, '');
  const estNumero = /^\d+$/.test(q);

  const [commandes, clients, livres, auteurs, articles, rencontres] = await Promise.all([
    estNumero
      ? query<any>(`SELECT number, status, total, email, customer.full_name AS nom FROM order WHERE number = $n LIMIT 5`, { n: Number(q) })
      : query<any>(`SELECT number, status, total, email, customer.full_name AS nom FROM order WHERE (email ?? '') CONTAINS $q OR (customer.email ?? '') CONTAINS $q OR string::lowercase(customer.full_name ?? '') CONTAINS $q ORDER BY number DESC LIMIT 5`, { q: bas }),
    query<any>(`SELECT meta::id(id) AS id, full_name, email, role FROM user WHERE string::lowercase(full_name ?? '') CONTAINS $q OR (email ?? '') CONTAINS $q LIMIT 5`, { q: bas }),
    chiffres.length >= 10
      ? query<any>(`SELECT slug, title, status, isbn_paper FROM book WHERE (isbn_paper ?? '') CONTAINS $c OR (isbn_ebook ?? '') CONTAINS $c LIMIT 5`, { c: chiffres })
      : query<any>(`SELECT slug, title, status, isbn_paper FROM book WHERE string::lowercase(title ?? '') CONTAINS $q LIMIT 5`, { q: bas }),
    query<any>(`SELECT slug, full_name FROM author WHERE string::lowercase(full_name ?? '') CONTAINS $q LIMIT 5`, { q: bas }),
    query<any>(`SELECT meta::id(id) AS id, title, status FROM article WHERE string::lowercase(title ?? '') CONTAINS $q LIMIT 5`, { q: bas }),
    query<any>(`SELECT meta::id(id) AS id, title, start_at FROM event WHERE string::lowercase(title ?? '') CONTAINS $q LIMIT 5`, { q: bas })
  ]);

  const groupes = [
    { titre: 'Commandes', items: commandes.map((o: any) => ({ href: `/admin/commandes/${o.number}`, libelle: `n°${o.number} — ${o.nom || o.email || 'invité'}`, detail: `${o.status} · ${Number(o.total ?? 0).toFixed(2)} €` })) },
    { titre: 'Comptes', items: clients.map((u: any) => ({ href: `/admin/utilisateurs/${u.id}`, libelle: u.full_name || u.email, detail: `${u.email ?? ''} · ${u.role}` })) },
    { titre: 'Livres', items: livres.map((b: any) => ({ href: `/admin/catalogue/${b.slug}`, libelle: b.title, detail: `${b.isbn_paper ?? ''} · ${b.status}` })) },
    { titre: 'Auteurs', items: auteurs.map((a: any) => ({ href: `/admin/auteurs/${a.slug}`, libelle: a.full_name, detail: '' })) },
    { titre: 'Articles', items: articles.map((a: any) => ({ href: `/admin/articles/${a.id}`, libelle: a.title, detail: a.status })) },
    { titre: 'Rencontres', items: rencontres.map((e: any) => ({ href: `/admin/rencontres/${e.id}`, libelle: e.title, detail: e.start_at ? new Date(e.start_at).toLocaleDateString('fr-FR') : '' })) }
  ].filter((g) => g.items.length);
  return json({ groupes });
};
