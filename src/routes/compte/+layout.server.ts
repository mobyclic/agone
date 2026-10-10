import type { LayoutServerLoad } from './$types';
import { requireUser } from '$lib/server/access';
import { getClub, adhesionActive } from '$lib/server/club';

export const load: LayoutServerLoad = async ({ locals, url }) => {
  const user = requireUser(locals, url.pathname);
  // Le club : l'adhésion en cours, ou une invitation discrète s'il est ouvert.
  const [club, adhesion] = await Promise.all([getClub(), adhesionActive(user.id)]);
  return { user, club: club.active ? { nom: club.nom, remise: club.remise, ends_at: adhesion?.ends_at ?? null, auto_renew: adhesion?.auto_renew ?? false } : null };
};
