/**
 * Gardes d'autorisation côté serveur (à utiliser dans load/actions).
 * L'app se connecte à Surreal en root : toute l'autorisation est ici, au niveau app.
 */
import { error, redirect } from '@sveltejs/kit';
import { isStaff, isAdmin } from '$lib/roles';

type User = App.Locals['user'];

/** Exige un utilisateur connecté ; sinon redirige vers /connexion?next=… */
export function requireUser(locals: App.Locals, next?: string): NonNullable<User> {
  if (!locals.user) {
    throw redirect(303, `/connexion${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  }
  return locals.user;
}

/** Exige un membre de l'équipe Agone (back-office : admin ou éditorial). */
export function requireStaff(locals: App.Locals, next?: string): NonNullable<User> {
  const u = requireUser(locals, next);
  if (!isStaff(u.role)) throw error(403, { code: 'FORBIDDEN', message: 'Accès réservé à l’équipe Agone.' });
  return u;
}

/** Exige un administrateur (droits sensibles : droits d'auteur, paramètres, comptes). */
export function requireAdmin(locals: App.Locals, next?: string): NonNullable<User> {
  const u = requireUser(locals, next);
  if (!isAdmin(u.role)) throw error(403, { code: 'FORBIDDEN', message: 'Accès réservé aux administrateurs.' });
  return u;
}
