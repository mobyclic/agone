import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser, requireStaff } from '$lib/server/access';
import { saveMedia, deleteMedia } from '$lib/server/media';

/** Upload authentifié → renvoie { id, url }. FormData: file, [folder], [kind], [alt]. */
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = requireUser(locals);
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) throw error(400, { message: 'Fichier manquant.' });
  if (file.size > 15 * 1024 * 1024) throw error(413, { message: 'Fichier trop volumineux (max 15 Mo).' });

  const folder = String(form.get('folder') || 'uploads').replace(/[^\w/-]+/g, '');
  const kind = (String(form.get('kind') || '') || undefined) as any;
  const alt = String(form.get('alt') || '') || undefined;

  const media = await saveMedia({ file, folder, kind, alt, ownerId: user.id.replace(/^user:/, '') });
  return json({ id: media.id, url: media.url, kind: media.kind });
};

/** Suppression d'un média (fichier R2 + fiche) : réservée au personnel. */
export const DELETE: RequestHandler = async ({ url, locals }) => {
  requireStaff(locals);
  const id = url.searchParams.get('id') ?? '';
  if (!id) throw error(400, { message: 'Identifiant manquant.' });
  const ok = await deleteMedia(id);
  if (!ok) throw error(404, { message: 'Média introuvable.' });
  return json({ ok: true });
};
