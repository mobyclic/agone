/**
 * Exports de la facturation : le CSV d'un lot de factures, et l'archive ZIP de
 * leurs PDF (l'original importé quand il existe, sinon notre rendu) avec le CSV
 * à côté. Le lot est une sélection cochée ou tout un filtre.
 */
import { zipSync, strToU8 } from 'fflate';
import { exportInvoices, renderInvoicePdf, type FiltreFactures } from './invoice';
import { getObject } from './storage';
import { query, recId } from './surreal';

const cellule = (v: unknown) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const nombre = (n: unknown) => String(Number(n ?? 0).toFixed(2)).replace('.', ',');
const date = (d?: string) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');
const ETAT: Record<string, string> = { draft: 'brouillon', proforma: 'pro forma', unpaid: 'à encaisser', partial: 'partielle', paid: 'réglée', cancelled: 'annulée' };

/** Filtre lu dans l'adresse : la sélection (ids) prime sur le reste. */
export function filtreDepuisUrl(p: URLSearchParams): FiltreFactures {
  const ids = (p.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    ids: ids.length ? ids : undefined, q: p.get('q') ?? undefined, kind: p.get('kind') ?? undefined, status: p.get('status') ?? undefined,
    clientId: p.get('client') ?? undefined, customerId: p.get('customer') ?? undefined,
    from: p.get('from') ?? undefined, to: p.get('to') ?? undefined, sort: (p.get('sort') as FiltreFactures['sort']) || 'date_desc'
  };
}

export function nomExport(f: FiltreFactures, extension: string): string {
  if (f.ids?.length) return `factures-selection-${f.ids.length}.${extension}`;
  return `factures${f.from ? `-${f.from}` : ''}${f.to ? `-${f.to}` : ''}.${extension}`;
}

/** Le CSV d'un lot (Excel : BOM, point-virgule, virgule décimale). */
export function csvFactures(rows: any[]): string {
  const entete = ['numero', 'type', 'etat', 'date', 'echeance', 'client', 'email', 'ville', 'pays', 'total_ht', 'tva', 'total_ttc', 'regle', 'reste_du', 'commande', 'origine', 'envoyee_le', 'fichier'];
  const lignes = rows.map((f: any) => {
    const signe = f.kind === 'credit_note' ? -1 : 1;
    const reste = f.kind === 'credit_note' || f.status === 'cancelled' ? 0 : Math.max(0, Number(f.total_ttc ?? 0) - Number(f.paid_total ?? 0));
    return [
      f.ref, f.kind === 'credit_note' ? 'avoir' : 'facture', ETAT[f.status] ?? f.status, date(f.issued_at), date(f.due_at),
      f.bill_to?.name ?? '', f.bill_to?.email ?? '', f.bill_to?.city ?? '', f.bill_to?.country ?? '',
      nombre(signe * Number(f.subtotal_ht ?? 0)), nombre(signe * Number(f.tax_total ?? 0)), nombre(signe * Number(f.total_ttc ?? 0)),
      nombre(f.paid_total), nombre(reste), f.order_number ?? '', f.imported_from === 'meg' ? 'MEG' : 'agone.org', date(f.sent_at), nomPdf(f)
    ].map(cellule).join(';');
  });
  return '﻿' + [entete.join(';'), ...lignes].join('\r\n');
}

/** Nom de fichier d'un PDF dans l'archive : « 2026-0004 ACRIMED.pdf ». */
export function nomPdf(f: any): string {
  const client = String(f.bill_to?.name ?? '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
  return `${f.ref}${client ? ` ${client}` : ''}.pdf`;
}

/** L'archive : un PDF par document (original importé, sinon rendu), plus le CSV. 500 documents au plus. */
export async function zipFactures(filtre: FiltreFactures): Promise<{ zip: Uint8Array; nb: number }> {
  const rows = (await exportInvoices(filtre)).slice(0, 500);
  const fichiers: Record<string, Uint8Array> = {};
  for (const f of rows) {
    let pdf: Uint8Array | null = null;
    if (f.imported_from === 'meg') {
      const doc = (await query<any>(`SELECT document.key AS key FROM ONLY $id`, { id: recId('invoice', f.id) })) as any;
      if (doc?.key) { const o = await getObject(doc.key); if (o) pdf = o.body; }
    }
    if (!pdf) { try { pdf = await renderInvoicePdf(f.id); } catch { continue; } }
    let nom = nomPdf(f);
    if (fichiers[nom]) nom = nom.replace(/\.pdf$/, ` (${f.id.slice(0, 4)}).pdf`);
    fichiers[nom] = pdf;
  }
  fichiers['factures.csv'] = strToU8(csvFactures(rows));
  return { zip: zipSync(fichiers, { level: 6 }), nb: rows.length };
}
