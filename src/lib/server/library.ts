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

/**
 * Rattrapage des droits d'accès : tout ebook PAYÉ par un client titulaire d'un
 * compte doit figurer dans sa bibliothèque.
 *
 * Les achats faits sur le nouveau site accordent le droit au paiement
 * (markOrderPaid), et la migration avait repris la table `agone_mabibliotheque`
 * de WordPress — mais les ebooks achetés sur WordPress DEPUIS la migration
 * n'étaient rattachés à rien : la synchro importe les commandes, pas la
 * bibliothèque. Cette passe comble l'écart à partir des commandes déjà en base,
 * sans rien demander à WordPress. Idempotente.
 */
export async function accorderEbooksPayes(
  opts: { dryRun?: boolean } = {}
): Promise<{ accordes: number; sansCompte: number; sansFichier: number }> {
  const PAYEES = ['completed', 'paid', 'processing', 'sent_to_bl'];
  const lignes = await query<any>(
    `SELECT in.customer AS u, out AS b, in AS commande FROM contains
       WHERE format = 'epub' AND in.status IN $payees`,
    { payees: PAYEES }
  );
  let accordes = 0, sansCompte = 0, sansFichier = 0;
  for (const l of lignes) {
    if (!l.u) { sansCompte++; continue; }
    const u = recId('user', String(l.u).replace(/^user:/, ''));
    const asset = (await query<any>(
      `SELECT meta::id(id) AS id FROM ebook_asset WHERE book = $b AND status = 'available' LIMIT 1`,
      { b: recId('book', String(l.b).replace(/^book:/, '')) }
    ))[0];
    if (!asset) { sansFichier++; continue; }
    const a = recId('ebook_asset', asset.id);
    const deja = await query<any>(`SELECT id FROM owns WHERE in = $u AND out = $a LIMIT 1`, { u, a });
    if (deja.length) continue;
    accordes++;
    if (!opts.dryRun) {
      await query(`RELATE $u->owns->$a SET order = $o`, {
        u, a, o: recId('order', String(l.commande).replace(/^order:/, ''))
      });
    }
  }
  return { accordes, sansCompte, sansFichier };
}
