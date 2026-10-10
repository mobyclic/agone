/**
 * Envoi d'une facture au client, avec le PDF en pièce jointe. Pour une
 * proforma, l'e-mail porte un bouton de validation : le client clique, la
 * facture définitive est créée et lui part aussitôt.
 */
import { randomBytes } from 'node:crypto';
import { query, recId } from './surreal';
import { sendMail, layout, button, SITE_URL, MAIL, etiquette, note } from './mail';
import { getInvoice, renderInvoicePdf, getCompany, emettreFacture } from './invoice';
import { getObject } from './storage';

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const eur = (n: number) => `${(n ?? 0).toFixed(2).replace('.', ',')} €`;

/** Le PDF à joindre : l'original importé s'il existe, sinon notre rendu. */
async function pdfDe(inv: any): Promise<Buffer> {
  if (inv.document_key) { const o = await getObject(inv.document_key); if (o) return Buffer.from(o.body); }
  return Buffer.from(await renderInvoicePdf(inv.id));
}

export async function envoyerFacture(id: string, opts: { to?: string; message?: string } = {}) {
  const inv = await getInvoice(id);
  if (!inv) return { ok: false, error: 'Facture introuvable.' };
  const to = (opts.to || inv.bill_to?.email || '').trim();
  if (!to) return { ok: false, error: 'Aucune adresse e-mail : renseignez le destinataire.' };
  if (inv.status === 'draft') return { ok: false, error: 'Un brouillon ne s’envoie pas : émettez la facture, ou passez-la en pro forma.' };
  if (inv.status === 'cancelled') return { ok: false, error: 'Ce document est annulé.' };
  const company = await getCompany();
  const proforma = inv.status === 'proforma';
  const avoir = inv.kind === 'credit_note';
  let token = inv.validation_token as string | undefined;
  if (proforma && !token) {
    token = randomBytes(24).toString('base64url');
    await query(`UPDATE $id SET validation_token = $t`, { id: recId('invoice', id), t: token });
  }
  const nom = proforma ? 'facture pro forma' : avoir ? 'avoir' : 'facture';
  const titre = proforma ? 'Facture pro forma' : avoir ? 'Avoir' : 'Facture';
  const html = layout(
    `${titre} n° ${esc(inv.ref)}`,
    `<p style="margin:0 0 16px">Bonjour,</p>
     ${opts.message ? `<p style="margin:0 0 16px;white-space:pre-line">${esc(opts.message)}</p>` : ''}
     <p style="margin:0">Veuillez trouver ci-joint ${proforma ? 'la' : avoir ? 'l’' : 'la'} ${nom} n° <strong>${esc(inv.ref)}</strong>
     du ${new Date(inv.issued_at).toLocaleDateString('fr-FR')}.</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0 0;border-top:2px solid ${MAIL.encre}">
       <tr><td style="padding:12px 0;font-family:${MAIL.display};font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${MAIL.encre}">Montant TTC</td>
           <td style="padding:12px 0;text-align:right;font-family:${MAIL.display};font-size:20px;font-weight:700;color:${MAIL.encre}">${eur(inv.total_ttc)}</td></tr>
     </table>
     ${proforma ? `${etiquette('Validation')}<p style="margin:0 0 16px">Pour accepter cette pro forma et recevoir la facture définitive, cliquez ci-dessous :</p>
       <p style="margin:0">${button(`${SITE_URL}/facture/valider/${token}`, 'Valider la facture')}</p>
       ${note('Ce lien vous est personnel. Sans validation, aucune facture n’est émise.')}` : ''}
     ${note(`${esc(company.legal_name ?? 'Éditions Agone')}${company.address ? ` — ${esc(String(company.address).replace(/\n/g, ', '))}` : ''}${company.email ? ` — ${esc(company.email)}` : ''}`)}`,
    { surtitre: avoir ? 'Avoir' : 'Facturation', apercu: `${titre} n° ${inv.ref} — ${eur(inv.total_ttc)} TTC` }
  );
  const res = await sendMail({
    to, subject: `${proforma ? 'Facture pro forma' : avoir ? 'Avoir' : 'Facture'} Agone n° ${inv.ref}`, html,
    attachments: [{ filename: `${proforma ? 'Proforma' : avoir ? 'Avoir' : 'Facture'}-${inv.ref}.pdf`, content: await pdfDe(inv) }]
  });
  if (res.ok) await query(`UPDATE $id SET sent_at = time::now(), sent_to = $to`, { id: recId('invoice', id), to });
  return res;
}

/** Proforma désignée par son jeton de validation (lien de l'e-mail). */
export async function proformaParToken(token: string) {
  if (!token || token.length < 16) return null;
  const rows = await query<any>(`SELECT meta::id(id) AS id FROM invoice WHERE validation_token = $t LIMIT 1`, { t: token });
  return rows[0] ? getInvoice(String(rows[0].id)) : null;
}

/** Le client valide : la pro forma est émise (numéro légal) et la facture lui part aussitôt. */
export async function validerProforma(token: string): Promise<{ ok: boolean; ref?: string; dejaValidee?: boolean; error?: string }> {
  const p = await proformaParToken(token);
  if (!p) return { ok: false, error: 'Lien inconnu ou expiré.' };
  if (p.status !== 'proforma') return { ok: true, ref: p.ref, dejaValidee: true };
  await query(`UPDATE $id SET validated_at = time::now()`, { id: recId('invoice', p.id) });
  const { ref } = await emettreFacture(p.id);
  const destinataire = p.sent_to || p.bill_to?.email;
  if (destinataire) await envoyerFacture(p.id, { to: destinataire, message: 'Merci pour votre validation : voici la facture définitive.' });
  return { ok: true, ref };
}
