/**
 * Rapprochement mensuel du stock chez Les Belles Lettres.
 *
 * L'état mensuel de l'extranet donne, titre par titre : stock début, entrées
 * (réimpressions), sorties (exemplaires partis sans vente : commandes du site,
 * réassorts des dépôts, services de presse…), ventes nettes, correction
 * d'inventaire du distributeur, stock fin. L'équation tient toujours :
 *   début + entrées − sorties − ventes nettes + inventaire = fin.
 *
 * Ce que nous savons des sorties : les commandes papier du site (expédiées par
 * BLDD) et les réassorts de dépôts commandés par l'EDI. La différence avec les
 * sorties du distributeur est l'« écart à qualifier » (SP, pilon, perte…).
 */
import { query, recId } from './surreal';
import { fetchBlStockMonth, type BlStockRow } from './belleslettres';

export interface LigneRapprochement {
  ean: string; title: string; author: string; book_id?: string; slug?: string;
  stock_start: number; entries: number; exits: number; gross_sales: number; returns: number; net_sales: number;
  free_copies: number; inventory: number; stock_end: number;
  /** Sorties connues d'AGONE sur le mois. */
  vpc: number; depots: number;
  /** Sorties du distributeur non expliquées par nos commandes. */
  ecart_sorties: number;
  /** Ce qu'on en a qualifié (nature → exemplaires) et ce qui reste à qualifier. */
  qualifie: Partial<Record<KindEcart, number>>;
  reste: number;
  /** début + entrées − sorties − ventes nettes + inventaire − fin ; 0 si l'état est cohérent. */
  controle: number;
}

export type KindEcart = 'sp' | 'pilon' | 'perte' | 'depot' | 'autre';
export const KIND_ECART: Record<KindEcart, string> = { sp: 'Service de presse', pilon: 'Pilon', perte: 'Perte / casse', depot: 'Dépôt hors AGONE', autre: 'Autre' };

export interface Rapprochement {
  annee: number; mois: number;
  lignes: LigneRapprochement[];
  totaux: Omit<LigneRapprochement, 'ean' | 'title' | 'author' | 'book_id' | 'slug'>;
  /** Titres de l'extranet absents du catalogue. */
  inconnus: number;
}

const somme = (l: LigneRapprochement[], k: keyof LigneRapprochement) => l.reduce((n, x) => n + Number(x[k] ?? 0), 0);

export async function rapprochementMois(annee: number, mois: number): Promise<Rapprochement> {
  const debut = new Date(Date.UTC(annee, mois - 1, 1));
  const fin = new Date(Date.UTC(annee, mois, 1));
  const [bldd, livres, commandes, reassorts, ecarts] = await Promise.all([
    fetchBlStockMonth(mois, annee),
    query<any>(`SELECT meta::id(id) AS id, isbn_paper, slug, title FROM book WHERE isbn_paper != NONE`),
    // Commandes papier du site sur le mois : expédiées par BLDD (date d'expédition inconnue avant l'EDI : on prend la commande).
    query<any>(
      `SELECT out AS book, in.channel AS channel, qty FROM contains
        WHERE format = 'papier' AND in.status IN ['paid', 'sent_to_bl', 'completed']
          AND in.channel IN ['web', 'vpc', 'depot'] AND in.created_at >= $s AND in.created_at < $e`,
      { s: debut, e: fin }
    ),
    // Réassorts de dépôts faits depuis le bureau (sans commande) : pour information.
    query<any>(`SELECT book, qty FROM depot_movement WHERE kind = 'reassort' AND order = NONE AND at >= $s AND at < $e`, { s: debut, e: fin }),
    query<any>(`SELECT book, kind, qty FROM bldd_ecart WHERE year = $y AND month = $m`, { y: annee, m: mois })
  ]);
  const qualifie = new Map<string, Partial<Record<KindEcart, number>>>();
  for (const e of ecarts) {
    const k = String(e.book).replace(/^book:/, '');
    const q = qualifie.get(k) ?? {}; q[e.kind as KindEcart] = (q[e.kind as KindEcart] ?? 0) + Number(e.qty ?? 0); qualifie.set(k, q);
  }
  const parIsbn = new Map<string, { id: string; slug?: string; title: string }>(livres.map((b: any) => [String(b.isbn_paper).replace(/\D/g, ''), { id: String(b.id), slug: b.slug ?? undefined, title: b.title }]));
  const vpc = new Map<string, number>(), depots = new Map<string, number>();
  for (const c of commandes) {
    const k = String(c.book).replace(/^book:/, '');
    const m = c.channel === 'depot' ? depots : vpc;
    m.set(k, (m.get(k) ?? 0) + Number(c.qty ?? 0));
  }
  void reassorts;
  const lignes: LigneRapprochement[] = bldd.map((r: BlStockRow) => {
    const b = parIsbn.get(r.ean);
    const v = b ? (vpc.get(b.id) ?? 0) : 0, d = b ? (depots.get(b.id) ?? 0) : 0;
    const controle = r.stock_start + r.entries - r.exits - r.net_sales + r.inventory - r.stock_end;
    const q = b ? (qualifie.get(b.id) ?? {}) : {};
    const ecart = r.exits - v - d;
    return {
      // Titre du catalogue quand le livre est connu (l'extranet rend des capitales sans accents) ; auteur BLDD sinon.
      ean: r.ean, title: b?.title ?? r.title, author: b ? '' : r.author, book_id: b?.id, slug: b?.slug,
      stock_start: r.stock_start, entries: r.entries, exits: r.exits, gross_sales: r.gross_sales, returns: Math.abs(r.returns_credited), net_sales: r.net_sales,
      free_copies: r.free_copies, inventory: r.inventory, stock_end: r.stock_end,
      vpc: v, depots: d, ecart_sorties: ecart, qualifie: q, reste: ecart - Object.values(q).reduce((n, x) => n + (x ?? 0), 0), controle
    };
  }).sort((a, b) => Math.abs(b.reste) - Math.abs(a.reste) || a.title.localeCompare(b.title, 'fr'));
  const totaux = {
    stock_start: somme(lignes, 'stock_start'), entries: somme(lignes, 'entries'), exits: somme(lignes, 'exits'), gross_sales: somme(lignes, 'gross_sales'),
    returns: somme(lignes, 'returns'), net_sales: somme(lignes, 'net_sales'), free_copies: somme(lignes, 'free_copies'), inventory: somme(lignes, 'inventory'),
    stock_end: somme(lignes, 'stock_end'), vpc: somme(lignes, 'vpc'), depots: somme(lignes, 'depots'), ecart_sorties: somme(lignes, 'ecart_sorties'), controle: somme(lignes, 'controle'),
    reste: somme(lignes, 'reste'),
    qualifie: (Object.keys(KIND_ECART) as KindEcart[]).reduce((acc, k) => { const n = lignes.reduce((t, l) => t + (l.qualifie[k] ?? 0), 0); if (n) acc[k] = n; return acc; }, {} as Partial<Record<KindEcart, number>>)
  };
  return { annee, mois, lignes, totaux, inconnus: lignes.filter((l) => !l.book_id).length };
}

/** Qualifie (ou corrige) une part de l'écart d'un titre pour un mois ; qty = 0 retire la ligne. */
export async function qualifierEcart(annee: number, mois: number, bookId: string, kind: KindEcart, qty: number, note?: string) {
  if (!KIND_ECART[kind]) throw new Error('Nature inconnue.');
  const b = recId('book', bookId);
  const q = Math.round(qty);
  await query(`DELETE bldd_ecart WHERE year = $y AND month = $m AND book = $b AND kind = $k`, { y: annee, m: mois, b, k: kind });
  if (q) await query(`CREATE bldd_ecart CONTENT $c`, { c: { book: b, year: annee, month: mois, kind, qty: q, note: note?.trim() || undefined } });
  return q;
}
