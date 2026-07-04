/** Bibliothèque ebook du client (arête user->owns->ebook_asset). */
import { query, recId } from './surreal';

export async function getUserLibrary(userId: string) {
  return query<any>(
    `SELECT out AS asset_id, out.book.title AS title, out.book.slug AS slug,
        out.book.cover.url AS cover_url, out.format AS format, out.status AS status, acquired_at
      FROM owns WHERE in = $u ORDER BY acquired_at DESC`,
    { u: recId('user', userId) }
  );
}

export async function userOwnsAsset(userId: string, assetId: string): Promise<boolean> {
  const rows = await query<any>(`SELECT id FROM owns WHERE in = $u AND out = $a LIMIT 1`, {
    u: recId('user', userId), a: recId('ebook_asset', assetId)
  });
  return rows.length > 0;
}

export async function getEbookAsset(assetId: string) {
  const rows = await query<any>(
    `SELECT id, book, book.title AS title, r2_key, filename, content_type, status FROM ebook_asset WHERE id = $id LIMIT 1`,
    { id: recId('ebook_asset', assetId) }
  );
  return rows[0] ?? null;
}
