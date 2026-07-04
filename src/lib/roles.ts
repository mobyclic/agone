/**
 * Rôles AGONE (champ `user.role`) — accès global au site.
 * Module universel : importable côté serveur ET dans les composants.
 *
 *  - admin    : équipe Agone, accès total au back-office (catalogue, commandes,
 *               stock, droits d'auteur, contenu, paramètres, utilisateurs).
 *  - editor   : équipe éditoriale — catalogue, auteurs, contenu (pas les droits
 *               d'auteur ni les paramètres sensibles).
 *  - customer : client/acheteur (compte public : bibliothèque, commandes, profil).
 *  - pending  : inscrit, email non encore vérifié.
 */
export type Role = 'admin' | 'editor' | 'customer' | 'pending';

export const isAdmin = (r?: string | null): boolean => r === 'admin';
/** Membre de l'équipe Agone → accès back-office. */
export const isStaff = (r?: string | null): boolean => r === 'admin' || r === 'editor';
/** Compte permettant l'accès à l'espace client connecté (/compte). */
export const canAccessAccount = (r?: string | null): boolean =>
  r === 'admin' || r === 'editor' || r === 'customer';

export const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrateur',
  editor: 'Éditorial',
  customer: 'Client',
  pending: 'En attente'
};
