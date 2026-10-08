/**
 * Référentiel des canaux de vente.
 *
 * Deux familles — vente directe, vente indirecte — et sous chacune autant de
 * canaux qu'on veut. Chaque canal dit d'où viennent ses chiffres :
 *   - les canaux de la maison (mode « api ») : `orders` (les commandes du site,
 *     par order.channel) ou `bldd` (l'extranet des Belles Lettres) — fixes ;
 *   - les canaux ajoutés : toujours en mode « manuel », un tableur importé,
 *     colonnes à faire correspondre. Un commutateur les montre ou non dans
 *     « Ventes par exercice » (un canal qui a des relevés sur l'année s'y montre
 *     de toute façon) et dans les statistiques.
 */
import { query, recId } from './surreal';

export interface Canal {
  id: string;
  code: string;
  name: string;
  family: 'direct' | 'indirect';
  mode: 'api' | 'manuel';
  connector?: 'orders' | 'bldd';
  order_channel?: string;
  enabled: boolean;
  color: string;
  notes?: string;
  /** Canal de la maison : toujours là, non modifiable (couleur et notes exceptées). */
  fixe: boolean;
}

/** Palette de repli, une teinte par rang : distinctes entre elles et lisibles empilées. */
export const PALETTE = ['#26425b', '#5b8fbf', '#2e8b57', '#8fbf5b', '#b5a642', '#d4211c', '#e07a1f', '#8e44ad', '#16a085', '#7f8c8d'];

/**
 * Les canaux de la maison : ils existent toujours, dans cet ordre, et ne se
 * modifient pas (sauf leur couleur et leurs notes). Les encaissements SumUp ne
 * sont pas un canal : ils relèvent du comptoir (commandes payées « SumUp »).
 */
const DEFAUTS: Omit<Canal, 'id' | 'fixe'>[] = [
  { code: 'web', name: 'Vente par correspondance', family: 'direct', mode: 'api', connector: 'orders', order_channel: 'web', enabled: true, color: '#26425b', notes: 'Commandes du site (Stripe) et commandes reçues par courrier ou mail, saisies à la main. Le papier est expédié par Les Belles Lettres, mais ces ventes ne figurent pas sur leur extranet.' },
  { code: 'comptoir', name: 'Comptoir & rencontres', family: 'direct', mode: 'api', connector: 'orders', order_channel: 'comptoir', enabled: true, color: '#2e8b57', notes: 'Ventes sur place, saisies à la main ou importées ; les encaissements SumUp s’y rapprochent.' },
  { code: 'bldd', name: 'Les Belles Lettres (distribution)', family: 'indirect', mode: 'api', connector: 'bldd', enabled: true, color: '#d4211c' },
  { code: 'depots', name: 'Dépôts & salons', family: 'indirect', mode: 'manuel', enabled: true, color: '#e07a1f', notes: 'Exemplaires confiés à des dépositaires (salonneurs, associations, librairies amies) qui les vendent pour Agone. Les carnets de vente importés depuis « Dépôts » créent ici les relevés, avec la facture au dépositaire et le stock du dépôt.' }
];
const FIXES = new Set(DEFAUTS.map((d) => d.code));
/** Anciens canaux de la maison : s'ils réapparaissent sans relevé, on les écarte. */
const OBSOLETES = ['vpc', 'sortie_editeur', 'sumup'];

/** Sous-canaux d'un canal : ce qu'il vend, par support — c'est la clé des séries statistiques. */
export const SOUS_CANAUX: Record<string, { format: 'paper' | 'ebook'; nom: string }[]> = {
  web: [{ format: 'paper', nom: 'Livre papier' }, { format: 'ebook', nom: 'Livre numérique' }]
};
const rang = (code: string) => { const i = DEFAUTS.findIndex((d) => d.code === code); return i < 0 ? 99 : i; };

const CHAMPS = `meta::id(id) AS id, code, name, family, mode, connector, order_channel, enabled, color, notes`;

/**
 * Sème les canaux de la maison et les maintient tels quels (nom, famille,
 * source, actifs) : seuls leur couleur et leurs notes appartiennent à l'utilisateur.
 */
export async function ensureCanaux(): Promise<void> {
  const existants = await query<any>(`SELECT ${CHAMPS} FROM sales_channel`);
  const parCode = new Map<string, any>(existants.map((c) => [c.code, c]));
  for (const d of DEFAUTS) {
    const e = parCode.get(d.code);
    if (!e) { await query(`CREATE sales_channel CONTENT $d`, { d }); continue; }
    const set: Record<string, unknown> = {};
    for (const k of ['name', 'family', 'mode', 'connector', 'order_channel', 'enabled'] as const) {
      if (e[k] !== (d as any)[k]) set[k] = (d as any)[k];
    }
    if (!e.color || e.color === '#7a7a7a') set.color = d.color;
    if (Object.keys(set).length) await query(`UPDATE $id MERGE $set`, { id: recId('sales_channel', e.id), set });
  }
  for (const code of OBSOLETES) {
    const e = parCode.get(code);
    if (!e) continue;
    const n = await query<any>(`SELECT count() AS n FROM sales_report WHERE channel = $id GROUP ALL`, { id: recId('sales_channel', e.id) });
    if (!n[0]?.n) await query(`DELETE $id`, { id: recId('sales_channel', e.id) });
  }
}

export async function listCanaux(opts: { enabledOnly?: boolean } = {}): Promise<Canal[]> {
  const rows = await query<any>(
    `SELECT ${CHAMPS} FROM sales_channel ${opts.enabledOnly ? 'WHERE enabled = true' : ''}`
  );
  // Vente directe d'abord ; les canaux de la maison dans leur ordre, puis les canaux ajoutés, par nom.
  return rows.map(normaliser).sort((a, b) => a.family.localeCompare(b.family) || rang(a.code) - rang(b.code) || a.name.localeCompare(b.name, 'fr'));
}

export async function getCanal(code: string): Promise<Canal | null> {
  const rows = await query<any>(`SELECT ${CHAMPS} FROM sales_channel WHERE code = $c LIMIT 1`, { c: code });
  return rows[0] ? normaliser(rows[0]) : null;
}

const normaliser = (r: any): Canal => ({
  id: String(r.id), code: r.code, name: r.name,
  family: r.family === 'indirect' ? 'indirect' : 'direct',
  mode: r.mode === 'manuel' ? 'manuel' : 'api',
  connector: r.connector ?? undefined, order_channel: r.order_channel ?? undefined,
  enabled: r.enabled !== false,
  color: r.color ?? '#7a7a7a', notes: r.notes ?? undefined,
  fixe: FIXES.has(r.code)
});

export interface CanalInput {
  code?: string; name: string; family?: string; enabled?: boolean; color?: string; notes?: string;
}

/** Code : lettres, chiffres, tirets bas — stable, il sert de clé dans les relevés. */
export const codeCanal = (v: string) =>
  v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

export async function upsertCanal(d: CanalInput, existingCode?: string): Promise<string> {
  const couleur = /^#[0-9a-f]{6}$/i.test(d.color ?? '') ? d.color : undefined;
  const notes = d.notes?.trim() || undefined;
  const existant = existingCode ? await getCanal(existingCode) : null;
  if (existant?.fixe) {
    // Canal de la maison : seuls la couleur et les notes se changent.
    await query(`UPDATE $id MERGE $c`, { id: recId('sales_channel', existant.id), c: { color: couleur ?? existant.color, notes } });
    return existant.code;
  }
  const code = existant?.code ?? codeCanal(d.code || d.name);
  if (!code) throw new Error('Code de canal vide.');
  if (!d.name?.trim()) throw new Error('Le nom est requis.');
  // Un canal ajouté est toujours alimenté par un tableur.
  const champs = {
    code, name: d.name.trim(), family: d.family === 'indirect' ? 'indirect' : 'direct',
    mode: 'manuel', connector: undefined, order_channel: undefined,
    enabled: d.enabled !== false, color: couleur, notes
  };
  if (existant) {
    await query(`UPDATE $id MERGE $c`, { id: recId('sales_channel', existant.id), c: { ...champs, color: champs.color ?? existant.color } });
    return code;
  }
  if (FIXES.has(code) || (await getCanal(code))) throw new Error(`Le code « ${code} » existe déjà.`);
  const n = (await listCanaux()).length;
  await query(`CREATE sales_channel CONTENT $c`, { c: { ...champs, color: champs.color ?? PALETTE[n % PALETTE.length] } });
  return code;
}

/** Montrer / cacher un canal ajouté ; ceux de la maison restent toujours actifs. */
export async function setCanalEnabled(code: string, enabled: boolean): Promise<void> {
  if (FIXES.has(code)) return;
  await query(`UPDATE sales_channel SET enabled = $e WHERE code = $c`, { e: enabled, c: code });
}

/** Suppression : jamais pour un canal de la maison, ni si des relevés s'y rattachent. */
export async function deleteCanal(code: string): Promise<{ ok: boolean; error?: string }> {
  const c = await getCanal(code);
  if (!c) return { ok: false, error: 'Canal introuvable.' };
  if (c.fixe) return { ok: false, error: 'Ce canal fait partie de la maison : il ne se supprime pas.' };
  const n = await query<any>(`SELECT count() AS n FROM sales_report WHERE channel = $id GROUP ALL`, { id: recId('sales_channel', c.id) });
  if (n[0]?.n) return { ok: false, error: `${n[0].n} relevé(s) s'appuient sur ce canal : désactivez-le plutôt.` };
  await query(`DELETE $id`, { id: recId('sales_channel', c.id) });
  return { ok: true };
}

/**
 * Les séries affichables : chaque canal se lit par format, papier et numérique,
 * quel que soit le canal — mais seulement pour les formats qu'il a vendus ; un
 * canal sans rien (API en veille) garde une série vide, à son nom.
 */
export interface SerieCanal { key: string; code: string; format: 'paper' | 'ebook'; nom: string; color: string; family: 'direct' | 'indirect' }
export const cleSerie = (code: string, format: 'paper' | 'ebook') => `${code}:${format}`;
export function seriesDe(canaux: Canal[], formatsVendus: Map<string, Set<'paper' | 'ebook'>>): SerieCanal[] {
  const out: SerieCanal[] = [];
  for (const c of canaux) {
    const vendus = formatsVendus.get(c.code) ?? new Set<'paper' | 'ebook'>();
    if (vendus.size === 0) { out.push({ key: cleSerie(c.code, 'paper'), code: c.code, format: 'paper', nom: c.name, color: c.color, family: c.family }); continue; }
    const seul = vendus.size === 1;
    if (vendus.has('paper')) out.push({ key: cleSerie(c.code, 'paper'), code: c.code, format: 'paper', nom: seul ? c.name : `${c.name} — papier`, color: c.color, family: c.family });
    if (vendus.has('ebook')) out.push({ key: cleSerie(c.code, 'ebook'), code: c.code, format: 'ebook', nom: seul ? c.name : `${c.name} — numérique`, color: seul ? c.color : eclaircir(c.color, 0.35), family: c.family });
  }
  return out;
}

/** Teinte dérivée pour la seconde série d'un canal éclaté (vers le blanc). */
export function eclaircir(hex: string, f: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  const c = (h: string) => Math.round(parseInt(h, 16) + (255 - parseInt(h, 16)) * f).toString(16).padStart(2, '0');
  return `#${c(m[1])}${c(m[2])}${c(m[3])}`;
}

/**
 * Les types de commande saisissables à la main : les canaux alimentés par les
 * commandes — la vente par correspondance (expédiée par Les Belles Lettres,
 * comme une commande du site), puis la vente sur place.
 */
export async function typesCommandeSaisie(): Promise<{ value: string; label: string }[]> {
  return (await listCanaux({ enabledOnly: true }))
    .filter((c) => c.connector === 'orders' && c.order_channel)
    .map((c) => ({ value: c.order_channel!, label: c.name }));
}
