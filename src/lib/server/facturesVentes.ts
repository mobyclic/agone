/**
 * Factures → ventes.
 *
 * Une facture émise à un client (libraire hors distribution, association,
 * collectivité…) avec des lignes du catalogue EST la vente : elle crée son
 * relevé sur le canal « factures » (Facturation directe), une ligne par titre.
 * Les factures de commandes et de carnets de dépôt ne comptent pas deux fois
 * (leurs ventes vivent déjà ailleurs) ; les factures importées de MEG ne
 * comptent qu'à la demande (count_sales = true), car MEG a pu facturer des
 * ventes qu'un carnet réimporte par ailleurs.
 *
 * Idempotent : synchroniser une facture refait son relevé ou le retire selon
 * son état du moment (émise, annulée, revenue en brouillon…).
 */
import { query, recId } from './surreal';
import { getCanal } from './canaux';
import { calculerLignesVente, type PrixLivre } from './facturesVentesCalcul';
export { calculerLignesVente };

export interface EtatVentes {
  /** La facture est-elle comptée dans les ventes ? */
  comptee: boolean;
  /** Pourquoi pas, sinon. */
  raison?: string;
  /** Réglage manuel : true forcée, false exclue, null règle. */
  mode: boolean | null;
  exemplaires: number;
  report_id?: string;
  /** La règle la compterait-elle si rien n'était forcé ? */
  regle: boolean;
}

const ETATS_EMIS = ['unpaid', 'partial', 'paid'];

async function lire(id: string) {
  const inv = (await query<any>(
    `SELECT meta::id(id) AS id, ref, kind, status, lines, issued_at, bill_to, order, order.number AS order_number, imported_from, count_sales, sales_report,
            (SELECT meta::id(id) AS id, label FROM carnet WHERE invoice = $parent.id LIMIT 1)[0] AS carnet
       FROM ONLY $id`, { id: recId('invoice', id) }
  )) as any;
  return inv ?? null;
}

/** Ce que la règle décide pour une facture, et pourquoi. */
function decider(inv: any): { regle: boolean; raison?: string } {
  if (!ETATS_EMIS.includes(inv.status)) return { regle: false, raison: inv.status === 'cancelled' ? 'document annulé' : 'document non émis' };
  if (inv.order) return { regle: false, raison: `commande n° ${inv.order_number ?? ''} : vente déjà comptée avec la commande`.replace('n°  :', 'n° :') };
  if (inv.carnet) return { regle: false, raison: `carnet de dépôt « ${inv.carnet.label} » : vente déjà comptée avec le carnet` };
  const livres = (inv.lines ?? []).filter((l: any) => l.book && Number(l.qty) > 0).length;
  if (!livres) return { regle: false, raison: 'aucune ligne du catalogue' };
  if (inv.imported_from === 'meg') return { regle: false, raison: 'facture importée de MEG : à inclure à la main si elle n’est pas déjà comptée ailleurs' };
  return { regle: true };
}

export async function etatVentesFacture(id: string): Promise<EtatVentes | null> {
  const inv = await lire(id);
  if (!inv) return null;
  const d = decider(inv);
  const mode: boolean | null = inv.count_sales === true ? true : inv.count_sales === false ? false : null;
  const comptee = !!inv.sales_report;
  let exemplaires = 0;
  if (comptee) {
    const n = await query<any>(`SELECT math::sum(units_sold - units_returned) AS n FROM sales_line WHERE report = $r GROUP ALL`, { r: recId('sales_report', String(inv.sales_report).replace(/^sales_report:/, '')) });
    exemplaires = Number(n[0]?.n ?? 0);
  }
  const raison = comptee ? undefined : mode === false ? 'exclue à la main' : (d.raison ?? (mode === null ? undefined : d.raison));
  return { comptee, raison, mode, exemplaires, report_id: inv.sales_report ? String(inv.sales_report).replace(/^sales_report:/, '') : undefined, regle: d.regle };
}

/** Refait (ou retire) le relevé de ventes d'une facture selon son état. */
export async function synchroniserVentesFacture(id: string): Promise<{ comptee: boolean; lignes: number }> {
  const inv = await lire(id);
  if (!inv) throw new Error('Document introuvable');
  const d = decider(inv);
  // Forçage : true compte dès que le document est émis et a des lignes du catalogue ; false ne compte jamais.
  const emise = ETATS_EMIS.includes(inv.status);
  const aDesLivres = (inv.lines ?? []).some((l: any) => l.book && Number(l.qty) > 0);
  const doitCompter = inv.count_sales === false ? false : inv.count_sales === true ? (emise && aDesLivres) : d.regle;

  const ancien = inv.sales_report ? recId('sales_report', String(inv.sales_report).replace(/^sales_report:/, '')) : null;
  if (ancien) { await query(`DELETE sales_line WHERE report = $r`, { r: ancien }); await query(`DELETE $r`, { r: ancien }); }
  if (!doitCompter) {
    if (ancien) await query(`UPDATE $id SET sales_report = NONE`, { id: recId('invoice', id) });
    return { comptee: false, lignes: 0 };
  }
  const canal = await getCanal('factures');
  if (!canal) throw new Error('Canal « Facturation directe » absent : ouvrez Canaux de vente pour le recréer.');
  const ids: string[] = [...new Set<string>((inv.lines ?? []).filter((l: any) => l.book).map((l: any) => String(l.book).replace(/^book:/, '')))];
  const livres = ids.length ? await query<any>(`SELECT meta::id(id) AS id, price_paper, vat_rate, isbn_paper FROM book WHERE id IN $ids`, { ids: ids.map((b) => recId('book', b)) }) : [];
  const prix = new Map<string, PrixLivre>(livres.map((b: any) => [String(b.id), { price_paper: b.price_paper, vat_rate: b.vat_rate, isbn_paper: b.isbn_paper }]));
  const lignes = calculerLignesVente(inv.kind, inv.lines ?? [], prix);
  const jour = new Date(inv.issued_at); jour.setHours(0, 0, 0, 0);
  const fin = new Date(jour); fin.setHours(23, 59, 59, 0);
  const rep = await query<any>(`CREATE sales_report CONTENT $c`, {
    c: { channel: recId('sales_channel', canal.id), period_start: jour, period_end: fin, label: `${inv.kind === 'credit_note' ? 'Avoir' : 'Facture'} ${inv.ref} — ${inv.bill_to?.name ?? ''}`.trim() }
  });
  const reportId = String(rep[0].id).replace(/^sales_report:/, '');
  if (lignes.length) {
    await query(`INSERT INTO sales_line $d`, {
      d: lignes.map((l) => ({ ...l, report: recId('sales_report', reportId), book: recId('book', l.book), note: `${inv.kind === 'credit_note' ? 'avoir' : 'facture'} ${inv.ref}` }))
    });
  }
  await query(`UPDATE $id SET sales_report = $r`, { id: recId('invoice', id), r: recId('sales_report', reportId) });
  return { comptee: true, lignes: lignes.length };
}

/** Réglage manuel du comptage (true : inclure, false : exclure, null : règle), puis resynchronisation. */
export async function definirComptageVentes(id: string, mode: boolean | null) {
  await query(`UPDATE $id SET count_sales = $m`, { id: recId('invoice', id), m: mode === null ? undefined : mode });
  return synchroniserVentesFacture(id);
}
