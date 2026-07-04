import { randomUUID } from 'node:crypto';
import { query, recId } from './surreal';
import { uploadOptimizedImage, uploadBuffer } from './storage';

export interface SavedMedia {
  id: string;
  url: string;
  key: string;
  kind: string;
}

/**
 * Optimise (si image) + upload sur R2 + crée un enregistrement `media`.
 * `folder` : préfixe R2 logique (ex: 'orgs/logos', 'ingredients', 'resources').
 */
export async function saveMedia(opts: {
  file: File;
  folder: string;
  kind?: 'image' | 'logo' | 'document' | 'avatar' | 'cover';
  ownerId?: string;
  alt?: string;
}): Promise<SavedMedia> {
  const buf = Buffer.from(await opts.file.arrayBuffer());
  const isImage = (opts.file.type || '').startsWith('image/');
  const id = randomUUID();
  const up = isImage
    ? await uploadOptimizedImage({ keyBase: `${opts.folder}/${id}`, input: buf, optim: { maxWidth: 1600 } })
    : await uploadBuffer({
        key: `${opts.folder}/${id}-${(opts.file.name || 'file').replace(/[^\w.-]+/g, '_')}`,
        buffer: buf,
        contentType: opts.file.type || 'application/octet-stream'
      });
  const kind = opts.kind ?? (isImage ? 'image' : 'document');
  const rows = await query<any>(`CREATE media CONTENT $m`, {
    m: {
      key: up.key,
      url: up.url,
      kind,
      mime: up.mime,
      filename: opts.file.name,
      size: up.size,
      alt: opts.alt,
      owner: opts.ownerId ? recId('user', opts.ownerId) : undefined
    }
  });
  return { id: String(rows[0].id), url: up.url, key: up.key, kind };
}
