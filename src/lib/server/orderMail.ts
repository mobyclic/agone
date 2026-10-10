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
import { sendMail, layout, button, lien, etiquette, note, MAIL, SITE_URL } from './mail';
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
  const td = `padding:12px 0;border-bottom:1px solid ${MAIL.filet};vertical-align:top`;
  const lignes = (o.lignes ?? []).map((l: any) =>
    `<tr><td style="${td}"><span style="font-weight:700;color:${MAIL.encre}">${esc(l.title)}</span><br>
       <span style="font-family:${MAIL.display};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${MAIL.gris}">${FORMAT[l.format] ?? esc(l.format)} × ${l.qty}</span></td>
     <td style="${td};text-align:right;white-space:nowrap">${eur(l.line_total)}</td></tr>`
  ).join('');
  const total = (libelle: string, montant: string, couleur = MAIL.texte) =>
    `<tr><td style="padding:5px 0;color:${MAIL.gris}">${libelle}</td><td style="padding:5px 0;text-align:right;white-space:nowrap;color:${couleur}">${montant}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;border-top:2px solid ${MAIL.encre}">${lignes}</table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin-top:8px">
      ${total('Sous-total', eur(o.subtotal))}
      ${o.discount_total > 0 ? total(`Remise${o.promo_code ? ` (${esc(o.promo_code)})` : ''}`, `−${eur(o.discount_total)}`, '#15803d') : ''}
      ${o.has_physical ? total('Livraison', o.shipping_total > 0 ? eur(o.shipping_total) : 'Offerte') : ''}
      <tr><td style="padding:12px 0 0;border-top:1px solid ${MAIL.filet};font-family:${MAIL.display};font-size:15px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${MAIL.encre}">Total</td>
          <td style="padding:12px 0 0;border-top:1px solid ${MAIL.filet};text-align:right;white-space:nowrap;font-family:${MAIL.display};font-size:18px;font-weight:700;color:${MAIL.encre}">${eur(o.total)}</td></tr>
    </table>`;
}

/** Confirmation de commande, après paiement. */
export async function sendOrderConfirmation(orderId: string, opts: { force?: boolean } = {}) {
  const o = await commande(orderId);
  if (!o?.email) return { ok: false, error: 'Commande sans email.' };
  if (o.confirmation_sent_at && !opts.force) return { ok: true, id: 'déjà envoyée' };
  const company = await getCompany();
  const prenom = o.prenom || o.billing?.first_name;
  const url = `${SITE_URL}/commande/${o.number}`;

  const html = layout(
    'Merci pour votre commande',
    `<p style="margin:0 0 22px">${prenom ? `Bonjour ${esc(prenom)},` : 'Bonjour,'} nous avons bien reçu votre commande et votre paiement.</p>
     ${recapitulatif(o)}
     ${o.has_ebook ? `${etiquette('Vos livres numériques')}<p style="margin:0 0 14px">Ils sont disponibles dès maintenant dans votre bibliothèque.</p><p style="margin:0">${button(`${SITE_URL}/compte/bibliotheque`, 'Ouvrir ma bibliothèque')}</p>` : ''}
     ${o.has_physical ? `${etiquette('Livraison à')}<p style="margin:0;font-size:14px">${adresse(o.shipping ?? o.billing)}</p>` : ''}
     <p style="margin:26px 0 0">${lien(url, 'Voir ma commande')}</p>
     ${note(`${esc(company.legal_name ?? 'Éditions Agone')}${company.address ? ` — ${esc(String(company.address).replace(/\n/g, ', '))}` : ''}`)}`,
    { surtitre: `Commande n° ${o.number}`, apercu: `Votre commande n° ${o.number} est confirmée.` }
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
    ? `${etiquette(`Suivi${o.carrier ? ` · ${esc(o.carrier)}` : ''}`)}<p style="margin:0 0 14px;font-family:${MAIL.display};font-size:18px;font-weight:700;letter-spacing:0.04em;color:${MAIL.encre}">${esc(o.tracking_number)}</p>${o.tracking_url ? `<p style="margin:0">${button(o.tracking_url, 'Suivre mon colis')}</p>` : ''}`
    : '';
  const html = layout(
    'Votre colis est en route',
    `<p style="margin:0">${prenom ? `Bonjour ${esc(prenom)},` : 'Bonjour,'} votre commande vient de partir.</p>
     ${suivi}
     ${etiquette('Adresse de livraison')}<p style="margin:0;font-size:14px">${adresse(o.shipping ?? o.billing)}</p>
     <p style="margin:26px 0 0">${lien(`${SITE_URL}/commande/${o.number}`, 'Voir ma commande')}</p>`,
    { surtitre: `Commande n° ${o.number}`, apercu: `Votre commande n° ${o.number} a été expédiée.` }
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
    'Remboursement',
    `<p style="margin:0">Bonjour, nous venons de rembourser <strong>${eur(montant)}</strong> sur votre commande n° ${o.number}.</p>
     ${note('Le montant apparaîtra sur votre compte sous quelques jours, selon votre banque.')}`,
    { surtitre: `Commande n° ${o.number}`, apercu: `Remboursement de ${eur(montant)}` }
  );
  return sendMail({ to: o.email, subject: `Remboursement — commande Agone n°${o.number}`, html });
}
