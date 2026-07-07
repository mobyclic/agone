/**
 * Bon de livraison PDF — expédition directe « sortie éditeur » (hors Belles Lettres).
 * Articles + quantités + adresse de livraison, sans prix. pdf-lib (polices standard).
 */
import { query, recId } from './surreal';
import { getCompany } from './invoice';

const cleanText = (s: string) =>
  s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/\s+/g, ' ').trim();

export async function renderDeliveryNotePdf(orderId: string): Promise<Uint8Array> {
  const o = (
    await query<any>(`SELECT number, created_at, shipping, billing, email FROM order WHERE id = $id LIMIT 1`, {
      id: recId('order', orderId)
    })
  )[0];
  if (!o) throw new Error('Commande introuvable');

  const rawLines = await query<any>(
    `SELECT out.title AS title, title_snapshot, out.isbn_paper AS isbn, format, qty
       FROM contains WHERE in = $id AND format != 'epub'`,
    { id: recId('order', orderId) }
  );
  const company = await getCompany();
  const addr = (o.shipping && Object.keys(o.shipping).length ? o.shipping : o.billing) ?? {};

  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const W = page.getWidth();
  const H = page.getHeight();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.08, 0.08);
  const grey = rgb(0.45, 0.45, 0.45);
  const M = 48;

  const text = (s: string, x: number, yTop: number, opts: { size?: number; bold?: boolean; color?: any; right?: number } = {}) => {
    const size = opts.size ?? 9;
    const f = opts.bold ? bold : font;
    const xx = opts.right != null ? opts.right - f.widthOfTextAtSize(s, size) : x;
    page.drawText(s, { x: xx, y: H - yTop, size, font: f, color: opts.color ?? ink });
  };
  const hline = (yTop: number) => page.drawLine({ start: { x: M, y: H - yTop }, end: { x: W - M, y: H - yTop }, thickness: 0.7, color: rgb(0.85, 0.85, 0.85) });

  // En-tête société
  let y = M + 4;
  text(company.legal_name, M, y, { size: 14, bold: true }); y += 16;
  for (const l of String(company.address || '').split('\n').map((s) => s.trim()).filter(Boolean)) { text(l, M, y, { size: 9, color: grey }); y += 12; }

  // Titre
  text('BON DE LIVRAISON', W - M, M + 6, { size: 18, bold: true, right: W - M });
  text(`Commande n° ${o.number}`, W - M, M + 26, { size: 11, bold: true, right: W - M });
  text(`Date : ${o.created_at ? new Date(o.created_at).toLocaleDateString('fr-FR') : ''}`, W - M, M + 42, { size: 9, color: grey, right: W - M });

  // Adresse de livraison
  y = Math.max(y, M + 60) + 22;
  text('Livrer à', M, y, { size: 8, bold: true, color: grey }); y += 14;
  const name = [addr.first_name, addr.last_name].filter(Boolean).join(' ') || addr.name || o.email || 'Client';
  text(name, M, y, { size: 10, bold: true }); y += 13;
  for (const l of [addr.address_1 || addr.address, addr.address_2, [addr.postcode, addr.city].filter(Boolean).join(' '), addr.country].filter(Boolean)) {
    text(String(l), M, y, { size: 9, color: grey }); y += 12;
  }

  // Tableau articles (sans prix)
  y += 20;
  const colQty = W - M;
  text('Désignation', M, y, { size: 8, bold: true, color: grey });
  text('ISBN', W - M - 200, y, { size: 8, bold: true, color: grey });
  text('Qté', colQty, y, { size: 8, bold: true, color: grey, right: colQty });
  y += 6; hline(y); y += 14;

  let totalQty = 0;
  for (const l of rawLines) {
    let desc = cleanText(String(l.title_snapshot || l.title || 'Livre'));
    if (desc.length > 52) desc = desc.slice(0, 51) + '…';
    text(desc, M, y, { size: 9 });
    if (l.isbn) text(String(l.isbn), W - M - 200, y, { size: 8, color: grey });
    text(String(l.qty ?? 1), colQty, y, { size: 9, right: colQty });
    totalQty += l.qty ?? 1;
    y += 15;
  }
  y += 2; hline(y); y += 16;
  text(`Total : ${totalQty} article${totalQty > 1 ? 's' : ''}`, colQty, y, { size: 10, bold: true, right: colQty });

  // Pied
  const footer = company.footer || '';
  if (footer) page.drawText(footer, { x: M, y: 60, size: 7.5, font, color: grey });
  page.drawText('Bon de livraison — sortie éditeur. Merci de vérifier la conformité de la livraison.', { x: M, y: 46, size: 7.5, font, color: grey });

  return doc.save();
}
