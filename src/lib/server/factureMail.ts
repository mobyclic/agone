/**
 * Envoi d'une facture au client, avec le PDF en pièce jointe. Pour une
 * proforma, l'e-mail porte un bouton de validation : le client clique, la
 * facture définitive est créée et lui part aussitôt.
 */
import { randomBytes } from 'node:crypto';
import { query, recId } from './surreal';
import { sendMail, layout, button, SITE_URL } from './mail';
import { getInvoice, renderInvoicePdf, getCompany, convertirProforma } from './invoice';
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
  const company = await getCompany();
  const proforma = inv.kind === 'proforma';
  const avoir = inv.kind === 'credit_note';
  let token = inv.validation_token as string | undefined;
  if (proforma && !token) {
    token = randomBytes(24).toString('base64url');
    await query(`UPDATE $id SET validation_token = $t`, { id: recId('invoice', id), t: token });
  }
  const nom = proforma ? 'facture pro forma' : avoir ? 'avoir' : 'facture';
  const html = layout(
    `${proforma ? 'Facture pro forma' : avoir ? 'Avoir' : 'Facture'} n° ${esc(inv.ref)}`,
    `<p style="margin:0 0 16px">Bonjour,</p>
     ${opts.message ? `<p style="margin:0 0 16px;white-space:pre-line">${esc(opts.message)}</p>` : ''}
     <p style="margin:0 0 16px">Veuillez trouver ci-joint ${proforma ? 'la' : avoir ? 'l’' : 'la'} ${nom} n° <strong>${esc(inv.ref)}</strong>
     du ${new Date(inv.issued_at).toLocaleDateString('fr-FR')}, d’un montant de <strong>${eur(inv.total_ttc)} TTC</strong>.</p>
     ${proforma ? `<p style="margin:18px 0 8px">Pour accepter cette proforma et recevoir la facture définitive, cliquez ci-dessous :</p>
       <p>${button(`${SITE_URL}/facture/valider/${token}`, 'Valider la facture')}</p>
       <p style="color:#57534e;font-size:13px">Ce lien vous est personnel. Sans validation, aucune facture n’est émise.</p>` : ''}
     <p style="color:#8a857c;font-size:12px;margin-top:24px">${esc(company.legal_name ?? 'Éditions Agone')}${company.address ? ` — ${esc(String(company.address).replace(/\n/g, ', '))}` : ''}${company.email ? ` — ${esc(company.email)}` : ''}</p>`
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
  const rows = await query<any>(`SELECT meta::id(id) AS id FROM invoice WHERE validation_token = $t AND kind = 'proforma' LIMIT 1`, { t: token });
  return rows[0] ? getInvoice(String(rows[0].id)) : null;
}

/** Le client valide : facture définitive créée, envoyée à l'adresse qui a reçu la proforma. */
export async function validerProforma(token: string): Promise<{ ok: boolean; ref?: string; dejaValidee?: boolean; error?: string }> {
  const p = await proformaParToken(token);
  if (!p) return { ok: false, error: 'Lien inconnu ou expiré.' };
  if (p.converted_to_id) return { ok: true, ref: p.converted_to_ref, dejaValidee: true };
  await query(`UPDATE $id SET validated_at = time::now()`, { id: recId('invoice', p.id) });
  const nid = await convertirProforma(p.id);
  const inv = await getInvoice(nid);
  if (p.sent_to || p.bill_to?.email) await envoyerFacture(nid, { to: p.sent_to || p.bill_to?.email, message: 'Merci pour votre validation : voici la facture définitive.' });
  return { ok: true, ref: inv?.ref };
}
