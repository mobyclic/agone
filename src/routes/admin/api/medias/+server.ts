import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/access';
import { listMedias } from '$lib/server/mediatheque';

/** Sélecteur de la médiathèque : images publiques, par nom, 36 par page. */
export const GET: RequestHandler = async ({ url, locals }) => {
  requireStaff(locals);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const { medias, total } = await listMedias({ q: url.searchParams.get('q') ?? '', imagesSeules: true, limit: 36, offset: (page - 1) * 36 });
  return json({ total, page, medias: medias.map((m) => ({ id: m.id, url: m.url, nom: m.filename || m.key.split('/').pop(), alt: m.alt, usage: m.usage, liens: m.liens.map((l) => l.label) })) });
};
