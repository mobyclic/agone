/**
 * Import des anciennes factures (MEG) : le PDF est lu (src/lib/megFacture), le
 * client professionnel retrouvé ou créé, la facture enregistrée sous son numéro
 * d'origine avec le PDF en pièce (il fait foi), et son règlement s'il est noté.
 * Idempotent : une facture déjà importée (même numéro) est laissée telle quelle.
 */
import { query, recId } from './surreal';
import { addPayment, recomputeInvoiceStatus } from './invoice';
import { modeReglement, type FactureMeg } from '$lib/megFacture';
import { heureParisVersDate } from '$lib/dates';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ResultatImport {
  ref: string; statut: 'cree' | 'existant'; id: string; client: 'cree' | 'existant' | 'aucun'; clientNom?: string;
}

/** Client professionnel : par son numéro MEG, sinon par sa raison sociale ; créé au besoin. */
async function clientPour(f: FactureMeg): Promise<{ id: string; cree: boolean } | null> {
  const c = f.client;
  if (!c.nom) return null;
  if (c.numero) {
    const r = await query<any>(`SELECT meta::id(id) AS id FROM client WHERE external_ref = $n LIMIT 1`, { n: c.numero });
    if (r[0]) return { id: String(r[0].id), cree: false };
  }
  const parNom = await query<any>(`SELECT meta::id(id) AS id, external_ref FROM client WHERE string::lowercase(name) = $n LIMIT 1`, { n: c.nom.toLowerCase() });
  if (parNom[0]) {
    if (c.numero && !parNom[0].external_ref) await query(`UPDATE $id SET external_ref = $n`, { id: recId('client', String(parNom[0].id)), n: c.numero });
    return { id: String(parNom[0].id), cree: false };
  }
  const nom = c.nom.toUpperCase();
  const kind = /LIBRAIRIE|LIBRERIA|BOOKS|LIVRES/.test(nom) ? 'librairie' : /ASSOC|ACRIMED|COLLECTIF/.test(nom) ? 'association'
    : /MEDIATHEQUE|BIBLIOTH|UNIVERSIT|ECOLE|LYCEE|COLLEGE|MAIRIE|DEPARTEMENT|CONSEIL/.test(nom) ? 'collectivite'
    : /SAS|SARL|SA |EURL|EDITIONS|DIFFUSION|\.FR|\.COM/.test(nom) ? 'entreprise' : 'autre';
  const rows = await query<any>(`CREATE client CONTENT $c`, {
    c: {
      name: c.nom, kind, external_ref: c.numero || undefined, vat_number: c.tva || undefined,
      email: c.email?.toLowerCase() || undefined, phone: c.tel || undefined,
      address_1: c.adresse[0] || undefined, address_2: c.adresse.slice(1).join(', ') || undefined,
      postcode: c.postcode || undefined, city: c.ville || undefined, country: c.pays ? c.pays[0] + c.pays.slice(1).toLowerCase() : 'France',
      notes: 'Importé des factures MEG.'
    }
  });
  return { id: String(rows[0].id).replace(/^client:/, ''), cree: true };
}

export async function importerFactureMeg(f: FactureMeg, opts: { mediaId?: string; annulee?: boolean } = {}): Promise<ResultatImport> {
  const deja = await query<any>(`SELECT meta::id(id) AS id FROM invoice WHERE ref = $r LIMIT 1`, { r: f.ref });
  if (deja[0]) return { ref: f.ref, statut: 'existant', id: String(deja[0].id), client: 'aucun' };

  const cl = await clientPour(f);
  const avoir = f.type === 'avoir';
  const date = heureParisVersDate(`${f.date}T12:00`) ?? new Date();
  // Un avoir MEG porte des montants négatifs ; chez nous un avoir est positif, signé à l'affichage.
  const signe = avoir ? -1 : 1;
  const lines = f.lignes.map((l) => {
    const qty = Math.abs(l.qty);
    const unit_ht = r2(l.pu_ht * (1 - l.remise_pct / 100));
    const ht = r2(signe * l.montant_ht);
    return {
      description: `${l.isbn ? `${l.isbn} – ` : ''}${l.description}${l.auteur ? ` (${l.auteur})` : ''}`,
      qty, unit_price_ht: unit_ht, unit_price_ttc: r2(unit_ht * (1 + l.tva / 100)),
      line_total_ttc: r2(ht * (1 + l.tva / 100)), line_total_ht: ht, vat_rate: l.tva,
      discount_pct: l.remise_pct || undefined, catalogue_ht: l.remise_pct ? l.pu_ht : undefined,
      isbn: l.isbn, code: l.code, unit: l.unite
    };
  });
  // Lien vers le catalogue par ISBN.
  const isbns = [...new Set(lines.map((l) => l.isbn).filter(Boolean))];
  if (isbns.length) {
    const livres = await query<any>(`SELECT meta::id(id) AS id, isbn_paper FROM book WHERE isbn_paper IN $i`, { i: isbns });
    const parIsbn = new Map(livres.map((b: any) => [b.isbn_paper, String(b.id)]));
    for (const l of lines) if (l.isbn && parIsbn.has(l.isbn)) (l as any).book = parIsbn.get(l.isbn);
  }
  const subtotal_ht = r2(signe * f.total_ht_net), tax_total = r2(signe * f.tva), total_ttc = r2(signe * f.total_ttc);
  const bill_to = {
    name: f.client.nom, email: f.client.email, contact_name: undefined,
    address_1: f.client.adresse.join(', ') || undefined, postcode: f.client.postcode, city: f.client.ville,
    country: f.client.pays ? f.client.pays[0] + f.client.pays.slice(1).toLowerCase() : 'France', vat_number: f.client.tva
  };
  const notes = [f.livraison ? `Adresse de livraison : ${f.livraison}` : '', f.complement ?? ''].filter(Boolean).join('\n') || undefined;
  const rows = await query<any>(`CREATE invoice CONTENT $c`, {
    c: {
      year: date.getFullYear(), number: Number(f.ref.replace(/\D/g, '')) || 0, ref: f.ref, kind: avoir ? 'credit_note' : 'invoice',
      client: cl ? recId('client', cl.id) : undefined, bill_to, lines, vat_rate: lines[0]?.vat_rate ?? 5.5, price_mode: 'ht',
      subtotal_ht, tax_total, total_ttc, shipping_ht: f.port_ht != null ? r2(signe * f.port_ht) : undefined,
      intro: f.intro, notes, issued_at: date,
      due_at: f.reglement?.echeance ? heureParisVersDate(`${f.reglement.echeance}T12:00`) ?? undefined : undefined,
      imported_from: 'meg', external_ref: f.reference, document: opts.mediaId ? recId('media', opts.mediaId) : undefined,
      status: opts.annulee ? 'cancelled' : 'unpaid'
    }
  });
  const id = String(rows[0].id).replace(/^invoice:/, '');
  if (!avoir && !opts.annulee && f.reglement?.regle_le) {
    await addPayment(id, {
      amount: Math.abs(f.reglement.regle_montant ?? f.total_ttc), paid_at: heureParisVersDate(`${f.reglement.regle_le}T12:00`) ?? new Date(),
      method: modeReglement(f.reglement.regle_par ?? f.reglement.mode), note: 'Réglé selon MEG'
    });
  } else if (!opts.annulee) await recomputeInvoiceStatus(id);
  return { ref: f.ref, statut: 'cree', id, client: cl ? (cl.cree ? 'cree' : 'existant') : 'aucun', clientNom: f.client.nom };
}
