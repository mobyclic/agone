import { randomUUID } from 'node:crypto';
import { query, recId } from './surreal';
import { uploadOptimizedImage, uploadBuffer, deleteFile } from './storage';

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

/**
 * Supprime un média pour de bon : le fichier R2 et la fiche, et le détache de
 * ce qui le référençait (couverture ou galerie d'un livre, portrait d'auteur,
 * image de rencontre ou d'article). Refusé s'il sert de pièce à une facture.
 */
export async function deleteMedia(id: string): Promise<boolean> {
  const m = recId('media', id.replace(/^media:/, ''));
  const rows = await query<any>(`SELECT key FROM media WHERE id = $m`, { m });
  if (!rows[0]) return false;
  const piece = await query<any>(`SELECT count() AS n FROM invoice WHERE document = $m GROUP ALL`, { m });
  if (piece[0]?.n) throw new Error('Ce fichier est la pièce d’une facture : il ne se supprime pas.');
  await Promise.all([
    query(`UPDATE book SET cover = NONE WHERE cover = $m`, { m }),
    query(`UPDATE book SET gallery -= $m WHERE gallery CONTAINS $m`, { m }),
    query(`UPDATE author SET portrait = NONE WHERE portrait = $m`, { m }),
    query(`UPDATE event SET cover = NONE WHERE cover = $m`, { m }),
    query(`UPDATE article SET cover = NONE WHERE cover = $m`, { m })
  ]);
  try { await deleteFile(String(rows[0].key)); } catch { /* fichier déjà absent : on retire quand même la fiche */ }
  await query(`DELETE $m`, { m });
  return true;
}
