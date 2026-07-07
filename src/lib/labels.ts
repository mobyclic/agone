/** Libellés partagés (client + serveur) — pas d'import serveur ici. */

export const ROLE_ORDER = ['author', 'editor', 'translator', 'preface', 'postface', 'illustrator', 'other'] as const;

export const ROLE_LABEL: Record<string, string> = {
  author: 'Auteur',
  editor: 'Édition',
  translator: 'Traduction',
  preface: 'Préface',
  postface: 'Postface',
  illustrator: 'Illustration',
  other: 'Contribution'
};

/** Statuts de commande (libellés FR). */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: 'En attente',
  paid: 'Payée',
  processing: 'En préparation',
  sent_to_bl: 'Transmise BL',
  completed: 'Terminée',
  cancelled: 'Annulée',
  refunded: 'Remboursée',
  failed: 'Échec'
};

/** Canal / type de commande (libellés FR). */
export const CHANNEL_LABEL: Record<string, string> = {
  web: 'Web',
  comptoir: 'Comptoir',
  vpc: 'VPC',
  sortie_editeur: 'Sortie éditeur'
};

/** Statuts d'article/livre (libellés FR). */
export const CONTENT_STATUS_LABEL: Record<string, string> = {
  published: 'Publié',
  draft: 'Brouillon',
  forthcoming: 'À paraître',
  out_of_print: 'Épuisé'
};

/**
 * Un livre est « à paraître » lorsqu'il est publié ET que sa date de parution
 * est STRICTEMENT postérieure à aujourd'hui. Ce n'est donc pas un statut mais
 * un état calculé à partir de `published_at`.
 */
export function isForthcoming(book: { status?: string; published_at?: string | null }): boolean {
  return (
    book.status === 'published' &&
    !!book.published_at &&
    new Date(book.published_at).getTime() > Date.now()
  );
}

/** Libellé d'état d'un livre (à paraître dérivé de la date, sinon le statut). */
export function bookStateLabel(book: { status?: string; published_at?: string | null }): string {
  if (isForthcoming(book)) return 'À paraître';
  return CONTENT_STATUS_LABEL[book.status ?? ''] ?? book.status ?? '';
}

/** Formate un prix en euros (fr). */
export function euros(n?: number | null): string | null {
  return n != null ? `${n.toFixed(2).replace('.', ',')} €` : null;
}

/** « Prénom NOM » — nom de famille en majuscules (repli sur le nom complet). */
export function authorLabel(a: { name?: string; first_name?: string; last_name?: string }): string {
  const last = (a.last_name ?? '').trim();
  const first = (a.first_name ?? '').trim();
  if (last) return `${first ? first + ' ' : ''}${last.toUpperCase()}`;
  return a.name ?? '';
}

/** Liste d'auteurs formatée « Prénom NOM, Prénom NOM ». */
export function authorList(authors?: { name?: string; first_name?: string; last_name?: string }[]): string {
  return (authors ?? []).map(authorLabel).filter(Boolean).join(', ');
}
