import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/access';
import { query } from '$lib/server/surreal';

/** Export CSV des commandes, avec les mêmes filtres que la liste. Excel-compatible (UTF-8 BOM, point-virgule). */
const cellule = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const GET: RequestHandler = async ({ url, locals }) => {
  requireAdmin(locals);
  const status = url.searchParams.get('status') || undefined;
  const type = url.searchParams.get('type') || undefined;
  const annee = Number(url.searchParams.get('annee')) || undefined;
  const where: string[] = [];
  const vars: Record<string, unknown> = {};
  if (status) { where.push('status = $status'); vars.status = status; }
  if (type === 'invites') where.push('customer = NONE');
  else if (type === 'clients') where.push('customer != NONE');
  if (annee) { where.push('time::year(created_at) = $annee'); vars.annee = annee; }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await query<any>(
    `SELECT number, status, channel, created_at, paid_at, email, customer.full_name AS nom,
            subtotal, shipping_total, discount_total, total, item_count, has_ebook, has_physical, promo_code,
            billing.postcode AS cp, billing.city AS ville, billing.country AS pays,
            carrier, tracking_number, invoice_number
       FROM order ${whereSql} ORDER BY created_at DESC LIMIT 20000`,
    vars
  );
  const entete = ['numero', 'statut', 'canal', 'date', 'payee_le', 'client', 'email', 'sous_total', 'port', 'remise', 'total',
    'articles', 'numerique', 'papier', 'code_promo', 'cp', 'ville', 'pays', 'transporteur', 'suivi', 'facture'];
  const lignes = rows.map((o) => [
    o.number, o.status, o.channel, o.created_at ? new Date(o.created_at).toLocaleString('fr-FR') : '',
    o.paid_at ? new Date(o.paid_at).toLocaleString('fr-FR') : '', o.nom ?? '', o.email ?? '',
    String(o.subtotal ?? 0).replace('.', ','), String(o.shipping_total ?? 0).replace('.', ','),
    String(o.discount_total ?? 0).replace('.', ','), String(o.total ?? 0).replace('.', ','),
    o.item_count ?? 0, o.has_ebook ? 'oui' : '', o.has_physical ? 'oui' : '', o.promo_code ?? '',
    o.cp ?? '', o.ville ?? '', o.pays ?? '', o.carrier ?? '', o.tracking_number ?? '', o.invoice_number ?? ''
  ].map(cellule).join(';'));
  const csv = '﻿' + [entete.join(';'), ...lignes].join('\r\n');
  const nom = `commandes${annee ? `-${annee}` : ''}${status ? `-${status}` : ''}.csv`;
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nom}"`, 'Cache-Control': 'private, no-store' }
  });
};
