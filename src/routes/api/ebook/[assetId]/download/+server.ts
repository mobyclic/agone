import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/access';
import { isStaff } from '$lib/roles';
import { userOwnsAsset, getEbookAsset } from '$lib/server/library';
import { getObject } from '$lib/server/storage';
import { query, recId } from '$lib/server/surreal';

export const GET: RequestHandler = async ({ params, locals, getClientAddress }) => {
  const user = requireUser(locals);
  const asset = await getEbookAsset(params.assetId);
  if (!asset) throw error(404, { message: 'Ebook introuvable' });

  const owns = await userOwnsAsset(user.id, params.assetId);
  if (!owns && !isStaff(user.role)) throw error(403, { code: 'FORBIDDEN', message: 'Vous ne possédez pas cet ebook.' });

  const obj = await getObject(asset.r2_key);
  if (!obj) throw error(404, { message: 'Fichier momentanément indisponible.' });

  query(`CREATE download_log CONTENT { user: $u, ebook_asset: $a, ip: $ip }`, {
    u: recId('user', user.id), a: recId('ebook_asset', params.assetId), ip: getClientAddress()
  }).catch(() => {});

  const safe = (asset.filename || `${asset.title || 'ebook'}.epub`).replace(/[^\w.\- éèàç-]/g, '_');
  return new Response(obj.body as any, {
    headers: {
      'Content-Type': asset.content_type || 'application/epub+zip',
      'Content-Disposition': `attachment; filename="${safe}"`,
      'Cache-Control': 'private, no-store'
    }
  });
};
