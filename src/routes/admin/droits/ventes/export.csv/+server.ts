import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/access';
import { query } from '$lib/server/surreal';

/** Export CSV des ventes relevées d'un exercice, ligne par titre et par canal. */
const cellule = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const GET: RequestHandler = async ({ url, locals }) => {
  requireAdmin(locals);
  const annee = Number(url.searchParams.get('annee')) || new Date().getUTCFullYear();
  const debut = new Date(Date.UTC(annee, 0, 1)), fin = new Date(Date.UTC(annee, 11, 31, 23, 59, 59));
  const rows = await query<any>(
    `SELECT book.title AS titre, book.isbn_paper AS isbn, isbn AS isbn_ligne, format,
            report.channel.name AS canal, report.period_start AS ps, report.period_end AS pe,
            units_sold, units_returned, units_export, gross_ht, gross_price, net_receipt
       FROM sales_line WHERE report.period_end >= $s AND report.period_start <= $e`,
    { s: debut, e: fin }
  );
  rows.sort((a: any, b: any) => String(a.titre ?? '').localeCompare(String(b.titre ?? ''), 'fr') || String(a.canal ?? '').localeCompare(String(b.canal ?? ''), 'fr'));
  const entete = ['titre', 'isbn', 'format', 'canal', 'periode_debut', 'periode_fin', 'vendus', 'retours', 'net', 'hors_france', 'prix_public_ht', 'prix_unitaire_ttc', 'net_facture'];
  const lignes = rows.map((l: any) => [
    l.titre ?? '(titre inconnu)', l.isbn ?? l.isbn_ligne ?? '', l.format ?? '', l.canal ?? '',
    l.ps ? new Date(l.ps).toLocaleDateString('fr-FR') : '', l.pe ? new Date(l.pe).toLocaleDateString('fr-FR') : '',
    l.units_sold ?? 0, l.units_returned ?? 0, (l.units_sold ?? 0) - (l.units_returned ?? 0), l.units_export ?? '',
    l.gross_ht != null ? String(l.gross_ht).replace('.', ',') : '', l.gross_price != null ? String(l.gross_price).replace('.', ',') : '',
    l.net_receipt != null ? String(l.net_receipt).replace('.', ',') : ''
  ].map(cellule).join(';'));
  const csv = '﻿' + [entete.join(';'), ...lignes].join('\r\n');
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="ventes-${annee}.csv"`, 'Cache-Control': 'private, no-store' }
  });
};
