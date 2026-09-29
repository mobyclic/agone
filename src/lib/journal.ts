/**
 * Journal des actions — ce qui peut tourner dans le navigateur.
 * (L'écriture et la lecture du journal vivent dans $lib/server/journal.)
 */

/** Lien vers la fiche visée, quand il y en a une. */
export function lienCible(type?: string, id?: string, details?: any): string | null {
  if (!type || !id) return null;
  switch (type) {
    case 'order': return details?.number ? `/admin/commandes/${details.number}` : null;
    case 'book': return details?.slug ? `/admin/catalogue/${details.slug}` : null;
    case 'author': return details?.slug ? `/admin/auteurs/${details.slug}` : null;
    case 'royalty_contract': return details?.book_id ? `/admin/droits/contrats/${details.book_id}` : null;
    case 'royalty_statement': return `/admin/droits/reddition/${id}`;
    case 'rights_deal': return `/admin/droits/cessions/${id}`;
    case 'article': return `/admin/articles/${id}`;
    case 'user': return `/admin/utilisateurs/${id}`;
    default: return null;
  }
}
