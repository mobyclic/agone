import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/access';
import { exportInvoices } from '$lib/server/invoice';

/** Export CSV des factures : la sélection cochée (ids) ou le filtre courant. Excel-compatible (BOM, point-virgule). */
const cellule = (v: unknown) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const nombre = (n: unknown) => String(Number(n ?? 0).toFixed(2)).replace('.', ',');
const date = (d?: string) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');
const ETAT: Record<string, string> = { draft: 'brouillon', proforma: 'pro forma', unpaid: 'à encaisser', partial: 'partielle', paid: 'réglée', cancelled: 'annulée' };

export const GET: RequestHandler = async ({ url, locals }) => {
  requireAdmin(locals);
  const p = url.searchParams;
  const ids = (p.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const rows = await exportInvoices({
    ids: ids.length ? ids : undefined, q: p.get('q') ?? undefined, kind: p.get('kind') ?? undefined, status: p.get('status') ?? undefined,
    from: p.get('from') ?? undefined, to: p.get('to') ?? undefined, sort: (p.get('sort') as any) || 'date_desc'
  });
  const entete = ['numero', 'type', 'etat', 'date', 'echeance', 'client', 'email', 'ville', 'pays', 'total_ht', 'tva', 'total_ttc', 'regle', 'reste_du', 'commande', 'origine', 'envoyee_le'];
  const lignes = rows.map((f: any) => {
    const signe = f.kind === 'credit_note' ? -1 : 1;
    const reste = f.kind === 'credit_note' || f.status === 'cancelled' ? 0 : Math.max(0, Number(f.total_ttc ?? 0) - Number(f.paid_total ?? 0));
    return [
      f.ref, f.kind === 'credit_note' ? 'avoir' : 'facture', ETAT[f.status] ?? f.status, date(f.issued_at), date(f.due_at),
      f.bill_to?.name ?? '', f.bill_to?.email ?? '', f.bill_to?.city ?? '', f.bill_to?.country ?? '',
      nombre(signe * Number(f.subtotal_ht ?? 0)), nombre(signe * Number(f.tax_total ?? 0)), nombre(signe * Number(f.total_ttc ?? 0)),
      nombre(f.paid_total), nombre(reste), f.order_number ?? '', f.imported_from === 'meg' ? 'MEG' : 'agone.org', date(f.sent_at)
    ].map(cellule).join(';');
  });
  const csv = '﻿' + [entete.join(';'), ...lignes].join('\r\n');
  const nom = ids.length ? `factures-selection-${ids.length}.csv` : `factures${p.get('from') ? `-${p.get('from')}` : ''}${p.get('to') ? `-${p.get('to')}` : ''}.csv`;
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nom}"`, 'Cache-Control': 'private, no-store' } });
};
