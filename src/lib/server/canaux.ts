/**
 * Référentiel des canaux de vente.
 *
 * Deux familles — vente directe, vente indirecte — et sous chacune autant de
 * canaux qu'on veut. Chaque canal dit d'où viennent ses chiffres :
 *   - mode « api » avec un connecteur : `orders` (les commandes du site, par
 *     order.channel), `bldd` (l'extranet des Belles Lettres) ou `sumup` (les
 *     encaissements du terminal, rapprochés du catalogue) ;
 *   - mode « api » sans connecteur : déclaré, pas encore branché — en veille ;
 *   - mode « manuel » : un tableur importé, colonnes à faire correspondre.
 * Un canal se désactive d'un commutateur : ses relevés passés restent, il ne se
 * propose plus nulle part.
 */
import { query, recId } from './surreal';

export interface Canal {
  id: string;
  code: string;
  name: string;
  family: 'direct' | 'indirect';
  mode: 'api' | 'manuel';
  connector?: 'orders' | 'bldd' | 'sumup';
  order_channel?: string;
  enabled: boolean;
  color: string;
  notes?: string;
}

/** Palette de repli, une teinte par rang : distinctes entre elles et lisibles empilées. */
export const PALETTE = ['#26425b', '#5b8fbf', '#2e8b57', '#8fbf5b', '#b5a642', '#d4211c', '#e07a1f', '#8e44ad', '#16a085', '#7f8c8d'];

const DEFAUTS: Omit<Canal, 'id'>[] = [
  { code: 'web', name: 'agone.org', family: 'direct', mode: 'api', connector: 'orders', order_channel: 'web', enabled: true, color: '#26425b', notes: 'Commandes du site, payées par Stripe. Le papier est expédié par Les Belles Lettres, mais ces ventes ne figurent pas sur leur extranet.' },
  { code: 'comptoir', name: 'Comptoir & rencontres', family: 'direct', mode: 'api', connector: 'orders', order_channel: 'comptoir', enabled: true, color: '#2e8b57' },
  { code: 'vpc', name: 'Vente par correspondance', family: 'direct', mode: 'api', connector: 'orders', order_channel: 'vpc', enabled: true, color: '#8fbf5b' },
  { code: 'sortie_editeur', name: 'Sortie éditeur', family: 'direct', mode: 'api', connector: 'orders', order_channel: 'sortie_editeur', enabled: true, color: '#b5a642' },
  { code: 'sumup', name: 'SumUp (rencontres & salons)', family: 'direct', mode: 'api', connector: 'sumup', enabled: true, color: '#8e44ad', notes: 'Encaissements du terminal, rapprochés des rencontres du jour et du catalogue.' },
  { code: 'bldd', name: 'Les Belles Lettres (distribution)', family: 'indirect', mode: 'api', connector: 'bldd', enabled: true, color: '#d4211c' }
];

const CHAMPS = `meta::id(id) AS id, code, name, family, mode, connector, order_channel, enabled, color, notes`;

/**
 * Sème les canaux de base et RÉPARE les lignes anciennes : un champ ajouté après
 * coup reste NONE sur l'existant (DEFAULT ne vaut qu'à la création).
 */
export async function ensureCanaux(): Promise<void> {
  const existants = await query<any>(`SELECT ${CHAMPS} FROM sales_channel`);
  const parCode = new Map<string, any>(existants.map((c) => [c.code, c]));
  for (const d of DEFAUTS) {
    const e = parCode.get(d.code);
    if (!e) { await query(`CREATE sales_channel CONTENT $d`, { d }); continue; }
    // On ne touche qu'à ce qui n'a jamais été renseigné : le reste appartient à l'utilisateur.
    const set: Record<string, unknown> = {};
    for (const k of ['family', 'mode', 'connector', 'order_channel', 'enabled', 'color'] as const) {
      if (e[k] === undefined || e[k] === null) set[k] = (d as any)[k];
    }
    if (e.color === '#7a7a7a' && d.color) set.color = d.color;
    if (Object.keys(set).length) await query(`UPDATE $id MERGE $set`, { id: recId('sales_channel', e.id), set });
  }
}

export async function listCanaux(opts: { enabledOnly?: boolean } = {}): Promise<Canal[]> {
  const rows = await query<any>(
    `SELECT ${CHAMPS} FROM sales_channel ${opts.enabledOnly ? 'WHERE enabled = true' : ''}`
  );
  // Vente directe d'abord, puis par nom — en ordre alphabétique français, pas en ordre d'octets.
  return rows.map(normaliser).sort((a, b) => a.family.localeCompare(b.family) || a.name.localeCompare(b.name, 'fr'));
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
  color: r.color ?? '#7a7a7a', notes: r.notes ?? undefined
});

export interface CanalInput {
  code: string; name: string; family: string; mode: string; connector?: string; order_channel?: string;
  enabled?: boolean; color?: string; notes?: string;
}

/** Code : lettres, chiffres, tirets bas — stable, il sert de clé dans les relevés. */
export const codeCanal = (v: string) =>
  v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

export async function upsertCanal(d: CanalInput, existingCode?: string): Promise<string> {
  const code = codeCanal(d.code || d.name);
  if (!code) throw new Error('Code de canal vide.');
  const connecteur = d.mode === 'manuel' ? undefined : (d.connector === 'orders' || d.connector === 'bldd' ? d.connector : undefined);
  const champs = {
    code, name: d.name.trim(), family: d.family === 'indirect' ? 'indirect' : 'direct',
    mode: d.mode === 'manuel' ? 'manuel' : 'api',
    connector: connecteur,
    order_channel: connecteur === 'orders' ? (d.order_channel || code) : undefined,
    enabled: d.enabled !== false,
    color: /^#[0-9a-f]{6}$/i.test(d.color ?? '') ? d.color : undefined,
    notes: d.notes?.trim() || undefined
  };
  const existant = existingCode ? await getCanal(existingCode) : null;
  if (existant) {
    await query(`UPDATE $id MERGE $c`, { id: recId('sales_channel', existant.id), c: { ...champs, color: champs.color ?? existant.color } });
    return code;
  }
  const deja = await getCanal(code);
  if (deja) throw new Error(`Le code « ${code} » existe déjà.`);
  const n = (await listCanaux()).length;
  await query(`CREATE sales_channel CONTENT $c`, { c: { ...champs, color: champs.color ?? PALETTE[n % PALETTE.length] } });
  return code;
}

export const setCanalEnabled = (code: string, enabled: boolean) =>
  query(`UPDATE sales_channel SET enabled = $e WHERE code = $c`, { e: enabled, c: code });

/** Suppression : refusée si des relevés s'y rattachent (ils ont besoin du canal). */
export async function deleteCanal(code: string): Promise<{ ok: boolean; error?: string }> {
  const c = await getCanal(code);
  if (!c) return { ok: false, error: 'Canal introuvable.' };
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
