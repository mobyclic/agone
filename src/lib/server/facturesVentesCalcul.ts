/**
 * Lignes de vente d'une facture : calcul pur, sans accès à la base (voir facturesVentes.ts).
 */
export interface LigneFacturePourVente {
  book?: string | null; isbn?: string | null; qty: number; unit_price_ht?: number; unit_price_ttc?: number; vat_rate?: number;
}
export interface PrixLivre { price_paper?: number | null; vat_rate?: number | null; isbn_paper?: string | null }

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Lignes de vente d'une facture (pur). gross_price = prix unitaire TTC facturé ;
 * gross_ht = total de ligne au prix public HT ; net_receipt = total de ligne
 * HT réellement facturé. Un avoir rend des retours.
 */
export function calculerLignesVente(kind: 'invoice' | 'credit_note', lines: LigneFacturePourVente[], prix: Map<string, PrixLivre>) {
  const parLivre = new Map<string, { book: string; isbn?: string; qty: number; gross_ht: number; net: number; unit_ttc: number }>();
  for (const l of lines) {
    const bookId = l.book ? String(l.book).replace(/^book:/, '') : '';
    const qty = Math.round(Number(l.qty) || 0);
    if (!bookId || qty <= 0) continue;
    const p = prix.get(bookId);
    const vat = Number(l.vat_rate ?? p?.vat_rate ?? 5.5);
    const ppttc = Number(p?.price_paper ?? l.unit_price_ttc ?? 0);
    const ppht = ppttc / (1 + vat / 100);
    const unitHt = l.unit_price_ht != null ? Number(l.unit_price_ht) : Number(l.unit_price_ttc ?? 0) / (1 + vat / 100);
    const cur = parLivre.get(bookId) ?? { book: bookId, isbn: (l.isbn ?? p?.isbn_paper ?? undefined) || undefined, qty: 0, gross_ht: 0, net: 0, unit_ttc: Number(l.unit_price_ttc ?? 0) };
    cur.qty += qty; cur.gross_ht += ppht * qty; cur.net += unitHt * qty;
    parLivre.set(bookId, cur);
  }
  return [...parLivre.values()].map((c) => ({
    book: c.book, isbn: c.isbn, format: 'paper' as const,
    units_sold: kind === 'credit_note' ? 0 : c.qty, units_returned: kind === 'credit_note' ? c.qty : 0, units_free: 0,
    gross_price: r2(c.unit_ttc), gross_ht: r2(c.gross_ht), net_receipt: r2(c.net)
  }));
}

