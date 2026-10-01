/**
 * SumUp — les encaissements du terminal de paiement (rencontres, salons, comptoir).
 *
 * SumUp ne connaît pas le catalogue : il ne rend qu'un montant, une date et,
 * parfois, un libellé tapé sur le terminal. Chaque encaissement est donc
 * RAPPROCHÉ d'un ou plusieurs livres :
 *   1. la ou les rencontres du jour donnent les candidats — le sous-catalogue
 *      déclaré sur la rencontre (`event.books`), sinon les livres de ses auteurs ;
 *   2. le montant se décompose sur ces candidats (un titre × n, ou deux titres) ;
 *   3. une seule lecture possible → rapproché automatiquement ; plusieurs, ou
 *      aucune rencontre ce jour-là → proposé, à trancher à la main.
 * Les encaissements rapprochés ont vocation à devenir des commandes du comptoir
 * (payées « SumUp ») : c'est le canal « Comptoir & rencontres » qui les porte.
 *
 * API : https://developer.sumup.com/api — clé `SUMUP_API_KEY` (sup_sk_…), code
 * marchand lu une fois sur le profil (ou `SUMUP_MERCHANT_CODE`).
 */
import { env } from '$env/dynamic/private';
import { query, recId } from './surreal';
import { getSetting, setSetting } from './site';

const API = 'https://api.sumup.com';
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** La clé est là : le canal peut relever et la collecte l'inclut. */
export const sumupConfigure = () => !!(env.SUMUP_API_KEY ?? '').trim();

async function appel<T>(path: string): Promise<T> {
  const key = (env.SUMUP_API_KEY ?? '').trim();
  if (!key) throw new Error('SUMUP_API_KEY manquante : renseignez la clé dans les variables d’environnement.');
  for (let essai = 0; ; essai++) {
    const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
    if (r.status === 429 && essai < 4) { await new Promise((ok) => setTimeout(ok, 500 * 2 ** essai)); continue; }
    if (!r.ok) throw new Error(`SumUp répond ${r.status} sur ${path.split('?')[0]} : ${(await r.text()).slice(0, 200)}`);
    return (await r.json()) as T;
  }
}

/** Code marchand : variable d'environnement, sinon le profil de la clé, mémorisé. */
async function codeMarchand(): Promise<string> {
  const force = (env.SUMUP_MERCHANT_CODE ?? '').trim();
  if (force) return force;
  const memo = await getSetting<{ merchant_code?: string }>('sumup');
  if (memo?.merchant_code) return memo.merchant_code;
  const me = await appel<any>('/v0.1/me');
  const code = me?.merchant_profile?.merchant_code;
  if (!code) throw new Error('Code marchand introuvable dans le profil SumUp (donnez SUMUP_MERCHANT_CODE).');
  await setSetting('sumup', { ...(memo ?? {}), merchant_code: code });
  return code;
}

// ── Relevé ────────────────────────────────────────────────────

/** Va chercher les encaissements de la période et rapproche les nouveaux. */
export async function releverEncaissements(depuis: Date, jusqua: Date) {
  const mc = await codeMarchand();
  const base = `/v2.1/merchants/${mc}/transactions/history`;
  let path: string | null =
    `${base}?limit=100&order=ascending&oldest_time=${encodeURIComponent(depuis.toISOString())}&newest_time=${encodeURIComponent(jusqua.toISOString())}`;
  const items: any[] = [];
  while (path) {
    const page: any = await appel<any>(path);
    items.push(...(page.items ?? []));
    const next: string | undefined = (page.links ?? []).find((l: any) => l.rel === 'next')?.href;
    // Le lien suivant est tantôt une adresse complète, tantôt la seule chaîne de requête.
    path = next ? (next.startsWith('http') ? next.replace(API, '') : `${base}?${next.replace(/^\?/, '')}`) : null;
    if (items.length > 20000) break;
  }

  let nouveaux = 0, autos = 0, aTraiter = 0;
  for (const it of items) {
    if (!it?.id || String(it.type ?? '').toUpperCase() === 'REFUND') continue;
    const statut = String(it.status ?? '').toUpperCase();
    if (!['SUCCESSFUL', 'REFUNDED', 'PAID_OUT'].includes(statut)) continue;
    const existant = await query<any>(`SELECT id, etat FROM sumup_transaction WHERE sumup_id = $s LIMIT 1`, { s: String(it.id) });
    const champs = {
      code: it.transaction_code ?? undefined, amount: Number(it.amount ?? 0), currency: it.currency ?? 'EUR',
      at: new Date(it.timestamp), status: statut === 'PAID_OUT' ? 'SUCCESSFUL' : statut,
      payment_type: it.payment_type ?? undefined, summary: it.product_summary || undefined,
      card: it.card_type ?? it.card?.type ?? undefined, fetched_at: new Date()
    };
    if (existant[0]) { await query(`UPDATE $id MERGE $c`, { id: recId('sumup_transaction', String(existant[0].id).replace(/^sumup_transaction:/, '')), c: champs }); continue; }
    const cree = await query<any>(`CREATE sumup_transaction CONTENT $c`, { c: { ...champs, sumup_id: String(it.id), etat: 'a_traiter' } });
    nouveaux++;
    const r = await rapprocher(String(cree[0].id).replace(/^sumup_transaction:/, ''));
    if (r === 'auto') autos++; else aTraiter++;
  }
  await setSetting('sumup', { ...((await getSetting('sumup')) ?? {}), dernier_releve: new Date().toISOString() });
  return { lus: items.length, nouveaux, autos, aTraiter };
}

// ── Rapprochement ─────────────────────────────────────────────
interface Livre { id: string; title: string; price: number }
export interface Lecture { libelle: string; items: { book: string; qty: number; price: number; title: string }[]; event?: string; origine: 'rencontre' | 'catalogue' }

/** Bornes du jour, heure de Paris, autour d'un instant. */
function bornesJour(at: Date) {
  const jour = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  const local = new Date(at.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const utc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }));
  const decalage = Math.round((local.getTime() - utc.getTime()) / 3600000);
  const d0 = new Date(`${jour}T00:00:00Z`);
  d0.setUTCHours(d0.getUTCHours() - decalage);
  return { d0, d1: new Date(d0.getTime() + 24 * 3600000 - 1) };
}

const livresDe = async (ids: string[]): Promise<Livre[]> =>
  ids.length
    ? (await query<any>(`SELECT id, title, price_paper FROM book WHERE id IN $ids AND price_paper != NONE`, { ids: ids.map((i) => recId('book', i.replace(/^book:/, ''))) }))
        .map((b: any) => ({ id: String(b.id), title: b.title, price: Number(b.price_paper) }))
    : [];

/** Rencontres du jour et livres candidats (sous-catalogue déclaré, sinon livres des auteurs). */
async function candidats(at: Date): Promise<{ events: { id: string; title: string }[]; livres: Livre[] }> {
  const { d0, d1 } = bornesJour(at);
  const events = await query<any>(
    `SELECT id, title, books, authors FROM event WHERE start_at <= $d1 AND (end_at ?? start_at) >= $d0 ORDER BY start_at`,
    { d0, d1 }
  );
  if (!events.length) return { events: [], livres: [] };
  const declares = events.flatMap((e: any) => (e.books ?? []).map(String));
  let livres = await livresDe(declares);
  if (!livres.length) {
    const auteurs = events.flatMap((e: any) => (e.authors ?? []).map(String));
    if (auteurs.length) {
      const rows = await query<any>(`SELECT VALUE <-contributed_by<-book FROM author WHERE id IN $ids`, { ids: auteurs.map((a: string) => recId('author', a.replace(/^author:/, ''))) });
      livres = await livresDe([...new Set(rows.flat().map(String))]);
    }
  }
  return { events: events.map((e: any) => ({ id: String(e.id), title: e.title })), livres };
}

/** Décompositions du montant sur des candidats : un titre × n, sinon deux titres. */
function lectures(montant: number, livres: Livre[], origine: Lecture['origine'], event?: string, maxQty = 10): Lecture[] {
  const eq = (a: number, b: number) => Math.abs(a - b) < 0.005;
  const out: Lecture[] = [];
  for (const l of livres) {
    if (!(l.price > 0)) continue;
    for (let q = 1; q <= maxQty; q++) {
      if (eq(l.price * q, montant)) out.push({ libelle: `${l.title}${q > 1 ? ` × ${q}` : ''}`, items: [{ book: l.id, qty: q, price: l.price, title: l.title }], event, origine });
    }
  }
  if (!out.length) {
    for (let i = 0; i < livres.length; i++) for (let j = i + 1; j < livres.length; j++) {
      const a = livres[i], b = livres[j];
      if (eq(a.price + b.price, montant)) out.push({ libelle: `${a.title} + ${b.title}`, items: [{ book: a.id, qty: 1, price: a.price, title: a.title }, { book: b.id, qty: 1, price: b.price, title: b.title }], event, origine });
    }
  }
  return out;
}

const itemsPourBase = (items: Lecture['items']) => items.map((i) => ({ book: recId('book', i.book.replace(/^book:/, '')), qty: i.qty, price: i.price, title: i.title }));

/** Rapproche un encaissement ; renvoie l'état obtenu. */
export async function rapprocher(id: string): Promise<'auto' | 'a_traiter'> {
  const tx = (await query<any>(`SELECT amount, at, status FROM ONLY $id`, { id: recId('sumup_transaction', id) })) as any;
  if (!tx) return 'a_traiter';
  const montant = Number(tx.amount);
  const { events, livres } = await candidats(new Date(tx.at));
  const ev = events[0]?.id;
  let propositions = lectures(montant, livres, 'rencontre', ev);
  if (propositions.length === 1) {
    await query(`UPDATE $id SET etat = 'auto', items = $items, event = $ev, suggestions = []`, {
      id: recId('sumup_transaction', id), items: itemsPourBase(propositions[0].items), ev: ev ? recId('event', ev.replace(/^event:/, '')) : undefined
    });
    return 'auto';
  }
  if (!propositions.length) {
    // Rien du côté des rencontres : le catalogue entier, au prix exact, en proposition seulement.
    const tous = (await query<any>(`SELECT id, title, price_paper FROM book WHERE status = 'published' AND price_paper > 0`))
      .map((b: any) => ({ id: String(b.id), title: b.title, price: Number(b.price_paper) }));
    propositions = lectures(montant, tous, 'catalogue', ev, 3).slice(0, 12);
  }
  await query(`UPDATE $id SET etat = 'a_traiter', suggestions = $s, event = $ev`, {
    id: recId('sumup_transaction', id), s: propositions, ev: ev ? recId('event', ev.replace(/^event:/, '')) : undefined
  });
  return 'a_traiter';
}

/** Repasse tout ce qui attend (après avoir complété une rencontre, par exemple). */
export async function rapprocherEnAttente(): Promise<{ examines: number; autos: number }> {
  const rows = await query<any>(`SELECT id FROM sumup_transaction WHERE etat = 'a_traiter'`);
  let autos = 0;
  for (const r of rows) if ((await rapprocher(String(r.id).replace(/^sumup_transaction:/, ''))) === 'auto') autos++;
  return { examines: rows.length, autos };
}

/** Validation à la main : une proposition retenue, ou des livres choisis. */
export async function validerEncaissement(id: string, choix: { suggestion?: number; bookIds?: string[]; qty?: number; note?: string }) {
  const tx = (await query<any>(`SELECT suggestions FROM ONLY $id`, { id: recId('sumup_transaction', id) })) as any;
  let items: Lecture['items'] = [];
  if (choix.suggestion != null && tx?.suggestions?.[choix.suggestion]) items = tx.suggestions[choix.suggestion].items;
  else if (choix.bookIds?.length) {
    const livres = await livresDe(choix.bookIds);
    if (!livres.length) throw new Error('Aucun livre reconnu.');
    const qty = Math.max(1, Math.round(choix.qty ?? 1));
    items = livres.map((l) => ({ book: l.id, qty: livres.length === 1 ? qty : 1, price: l.price, title: l.title }));
  } else throw new Error('Indiquez le livre vendu.');
  await query(`UPDATE $id SET etat = 'valide', items = $items, note = $n`, { id: recId('sumup_transaction', id), items: itemsPourBase(items), n: choix.note || undefined });
}

export const ignorerEncaissement = (id: string, note?: string) =>
  query(`UPDATE $id SET etat = 'ignore', items = [], note = $n`, { id: recId('sumup_transaction', id), n: note || undefined });

export const rouvrirEncaissement = (id: string) =>
  query(`UPDATE $id SET etat = 'a_traiter', items = []`, { id: recId('sumup_transaction', id) });

// ── Lecture ───────────────────────────────────────────────────
export async function listerEncaissements(opts: { etat?: string; limit?: number } = {}) {
  const where = opts.etat ? 'WHERE etat = $etat' : '';
  const rows = await query<any>(
    `SELECT id, sumup_id, amount, currency, at, status, payment_type, summary, card, etat, items, suggestions, note,
            event.title AS event_title, event.slug AS event_slug
       FROM sumup_transaction ${where} ORDER BY at DESC LIMIT $limit`,
    { etat: opts.etat, limit: opts.limit ?? 200 }
  );
  return rows.map((r: any) => ({ ...r, id: String(r.id).replace(/^sumup_transaction:/, '') }));
}

export async function comptesParEtat(): Promise<Record<string, number>> {
  const rows = await query<any>(`SELECT etat, count() AS n FROM sumup_transaction GROUP BY etat`);
  return Object.fromEntries(rows.map((r: any) => [r.etat, r.n]));
}

export async function etatSumup() {
  const memo = await getSetting<{ merchant_code?: string; dernier_releve?: string }>('sumup');
  return { configure: sumupConfigure(), merchant_code: memo?.merchant_code, dernier_releve: memo?.dernier_releve };
}
