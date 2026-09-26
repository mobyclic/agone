/**
 * Emails de commande — ce que le client reçoit sans qu'on y pense.
 *
 *   confirmation   : dès que le paiement est constaté (webhook Stripe ou
 *                    commande saisie au comptoir avec un email).
 *   expédition     : quand la commande part, avec le numéro de suivi s'il y en a.
 *   remboursement  : quand un remboursement est fait depuis la fiche.
 *
 * Chaque envoi est horodaté sur la commande : un webhook rejoué ou un double
 * clic ne renverra rien. `force` sert au bouton « Renvoyer » de la fiche.
 */
import { sendMail, layout, button, SITE_URL } from './mail';
import { query, recId } from './surreal';
import { getCompany } from './invoice';

const eur = (n: number) => `${(n ?? 0).toFixed(2).replace('.', ',')} €`;
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FORMAT: Record<string, string> = { papier: 'Papier', epub: 'Numérique (ePub)', souscription: 'Souscription' };

async function commande(orderId: string) {
  const o = (await query<any>(
    `SELECT meta::id(id) AS id, number, status, email, total, subtotal, shipping_total, discount_total, promo_code,
            has_ebook, has_physical, billing, shipping, carrier, tracking_number, tracking_url,
            confirmation_sent_at, shipping_notified_at, customer.first_name AS prenom
       FROM order WHERE id = $id LIMIT 1`,
    { id: recId('order', orderId) }
  ))[0];
  if (!o) return null;
  const lignes = await query<any>(
    `SELECT out.title AS title, format, qty, line_total FROM contains WHERE in = $id`,
    { id: recId('order', orderId) }
  );
  return { ...o, lignes };
}

function adresse(a?: Record<string, any>): string {
  if (!a) return '';
  const g = (k: string) => (a[k] ? String(a[k]) : '');
  return [
    [g('first_name'), g('last_name')].filter(Boolean).join(' '),
    g('address_1') || g('address'), g('address_2'),
    [g('postcode') || g('postal_code'), g('city')].filter(Boolean).join(' '),
    g('country')
  ].filter(Boolean).map(esc).join('<br>');
}

function recapitulatif(o: any): string {
  const lignes = (o.lignes ?? []).map((l: any) =>
    `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${esc(l.title)}<br><span style="color:#8a857c;font-size:12px">${FORMAT[l.format] ?? esc(l.format)} × ${l.qty}</span></td>
     <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${eur(l.line_total)}</td></tr>`
  ).join('');
  const total = (libelle: string, montant: string, gras = false) =>
    `<tr><td style="padding:4px 0;color:#57534e">${libelle}</td><td style="padding:4px 0;text-align:right;${gras ? 'font-weight:700;font-size:16px' : ''}">${montant}</td></tr>`;
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${lignes}</table>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:10px">
      ${total('Sous-total', eur(o.subtotal))}
      ${o.discount_total > 0 ? total(`Remise${o.promo_code ? ` (${esc(o.promo_code)})` : ''}`, `−${eur(o.discount_total)}`) : ''}
      ${o.has_physical ? total('Livraison', o.shipping_total > 0 ? eur(o.shipping_total) : 'Offerte') : ''}
      ${total('Total', eur(o.total), true)}
    </table>`;
}

/** Confirmation de commande, après paiement. */
export async function sendOrderConfirmation(orderId: string, opts: { force?: boolean } = {}) {
  const o = await commande(orderId);
  if (!o?.email) return { ok: false, error: 'Commande sans email.' };
  if (o.confirmation_sent_at && !opts.force) return { ok: true, id: 'déjà envoyée' };
  const company = await getCompany();
  const prenom = o.prenom || o.billing?.first_name;
  const lien = `${SITE_URL}/commande/${o.number}`;

  const html = layout(
    `Merci pour votre commande n°${o.number}`,
    `<p style="margin:0 0 16px">${prenom ? `Bonjour ${esc(prenom)},` : 'Bonjour,'} nous avons bien reçu votre commande et votre paiement.</p>
     ${recapitulatif(o)}
     ${o.has_ebook ? `<p style="margin:18px 0 6px">Vos livres numériques sont disponibles dès maintenant dans votre bibliothèque :</p><p>${button(`${SITE_URL}/compte/bibliotheque`, 'Ouvrir ma bibliothèque')}</p>` : ''}
     ${o.has_physical ? `<p style="margin:18px 0 6px;color:#57534e;font-size:13px">Livraison à :</p><p style="margin:0;font-size:14px">${adresse(o.shipping ?? o.billing)}</p><p style="margin:12px 0 0;color:#57534e;font-size:13px">Les livres papier sont expédiés par notre distributeur sous quelques jours ; vous recevrez un email au départ du colis.</p>` : ''}
     <p style="margin-top:20px"><a href="${lien}" style="color:#d4211c">Voir ma commande</a></p>
     <p style="color:#8a857c;font-size:12px;margin-top:20px">${esc(company.legal_name ?? 'Éditions Agone')}${company.address ? ` — ${esc(String(company.address).replace(/\n/g, ', '))}` : ''}</p>`
  );
  const res = await sendMail({ to: o.email, subject: `Votre commande Agone n°${o.number}`, html });
  if (res.ok) await query(`UPDATE $id SET confirmation_sent_at = time::now()`, { id: recId('order', orderId) });
  return res;
}

/** Avis d'expédition, avec le suivi s'il est renseigné. */
export async function sendShippingNotice(orderId: string, opts: { force?: boolean } = {}) {
  const o = await commande(orderId);
  if (!o?.email) return { ok: false, error: 'Commande sans email.' };
  if (!o.has_physical) return { ok: false, error: 'Rien à expédier : commande numérique.' };
  if (o.shipping_notified_at && !opts.force) return { ok: true, id: 'déjà envoyé' };
  const prenom = o.prenom || o.billing?.first_name;
  const suivi = o.tracking_number
    ? `<p style="margin:16px 0 6px">Numéro de suivi${o.carrier ? ` (${esc(o.carrier)})` : ''} : <strong>${esc(o.tracking_number)}</strong></p>${o.tracking_url ? `<p>${button(o.tracking_url, 'Suivre mon colis')}</p>` : ''}`
    : '';
  const html = layout(
    `Votre commande n°${o.number} est en route`,
    `<p style="margin:0 0 12px">${prenom ? `Bonjour ${esc(prenom)},` : 'Bonjour,'} votre colis vient de partir.</p>
     ${suivi}
     <p style="margin:16px 0 6px;color:#57534e;font-size:13px">Adresse de livraison :</p><p style="margin:0;font-size:14px">${adresse(o.shipping ?? o.billing)}</p>
     <p style="margin-top:20px"><a href="${SITE_URL}/commande/${o.number}" style="color:#d4211c">Voir ma commande</a></p>`
  );
  const res = await sendMail({ to: o.email, subject: `Votre commande Agone n°${o.number} est en route`, html });
  if (res.ok) await query(`UPDATE $id SET shipping_notified_at = time::now()`, { id: recId('order', orderId) });
  return res;
}

/** Avis de remboursement. */
export async function sendRefundNotice(orderId: string, montant: number) {
  const o = await commande(orderId);
  if (!o?.email) return { ok: false, error: 'Commande sans email.' };
  const html = layout(
    `Remboursement de votre commande n°${o.number}`,
    `<p style="margin:0 0 12px">Bonjour, nous venons de rembourser <strong>${eur(montant)}</strong> sur votre commande n°${o.number}.</p>
     <p style="color:#57534e;font-size:13px">Le montant apparaîtra sur votre compte sous quelques jours, selon votre banque.</p>`
  );
  return sendMail({ to: o.email, subject: `Remboursement — commande Agone n°${o.number}`, html });
}
