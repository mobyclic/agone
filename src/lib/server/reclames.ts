/**
 * Réclames : bandeaux et fenêtres promotionnelles, programmés et publiés ou non.
 * Sur le site, pour chaque type, la réclame publiée la plus récente dont les
 * dates couvrent aujourd'hui s'affiche (voir +layout.server.ts).
 *
 * Une seule réclame de chaque type à l'écran : publier une réclame repasse en
 * brouillon celles du même type dont les dates la chevauchent (aujourd'hui ou
 * plus tard). Des réclames programmées à la suite restent publiées ensemble.
 */
import { query, recId } from './surreal';

export type KindReclame = 'bandeau' | 'modal';
export const KIND_RECLAME: Record<KindReclame, string> = { bandeau: 'Bandeau', modal: 'Fenêtre' };
export const VARIANTS_BANDEAU: Record<string, string> = { info: 'Information (noir)', brand: 'Marque (rouge)', warning: 'Avertissement', success: 'Succès' };
export const FREQUENCES: Record<string, string> = { once: 'Une seule fois par visiteur', day: 'Une fois par jour', session: 'À chaque visite', always: 'À chaque page' };

export interface Reclame {
  id: string; kind: KindReclame; status: 'draft' | 'published'; title: string; message?: string; url?: string; cta_label?: string;
  image_id?: string; image_url?: string; variant: string; frequency: string; delay: number;
  starts_at?: string; ends_at?: string; created_at: string; updated_at: string;
  /** Calculé : publiée et dans ses dates. */
  en_ligne: boolean;
}

const CHAMPS = `meta::id(id) AS id, kind, status, title, message, url, cta_label, image, image.url AS image_url, variant, frequency, delay, starts_at, ends_at, created_at, updated_at`;

const dansDates = (r: any, now = Date.now()) =>
  (!r.starts_at || new Date(r.starts_at).getTime() <= now) && (!r.ends_at || new Date(r.ends_at).getTime() + 86400_000 > now);

const normaliser = (r: any): Reclame => ({
  id: String(r.id), kind: r.kind, status: r.status === 'published' ? 'published' : 'draft', title: r.title ?? '', message: r.message ?? undefined, url: r.url ?? undefined,
  cta_label: r.cta_label ?? undefined, image_id: r.image ? String(r.image).replace(/^media:/, '') : undefined, image_url: r.image_url ?? undefined,
  variant: r.variant ?? 'info', frequency: r.frequency ?? 'day', delay: Number(r.delay ?? 2),
  starts_at: r.starts_at ?? undefined, ends_at: r.ends_at ?? undefined, created_at: r.created_at, updated_at: r.updated_at,
  en_ligne: r.status === 'published' && dansDates(r)
});

export async function listReclames(): Promise<Reclame[]> {
  const rows = await query<any>(`SELECT ${CHAMPS} FROM reclame ORDER BY created_at DESC`);
  return rows.map(normaliser);
}

export async function getReclame(id: string): Promise<Reclame | null> {
  const rows = await query<any>(`SELECT ${CHAMPS} FROM reclame WHERE id = $id LIMIT 1`, { id: recId('reclame', id) });
  return rows[0] ? normaliser(rows[0]) : null;
}

export interface ReclameInput {
  kind: KindReclame; status: 'draft' | 'published'; title: string; message?: string; url?: string; cta_label?: string; imageId?: string;
  variant?: string; frequency?: string; delay?: number; starts_at?: string; ends_at?: string;
}

type Periode = { starts_at?: string | Date; ends_at?: string | Date };

/** Intervalle d'affichage, borné au présent : une réclame échue ne gêne plus personne. */
function intervalle(r: Periode, now = Date.now()): [number, number] {
  const debut = Math.max(now, r.starts_at ? new Date(r.starts_at).getTime() : -Infinity);
  const fin = r.ends_at ? new Date(r.ends_at).getTime() + 86400_000 : Infinity; // date de fin incluse
  return [debut, fin];
}

/** Deux réclames s'afficheraient en même temps, aujourd'hui ou plus tard. */
export function chevauchent(a: Periode, b: Periode): boolean {
  const [a0, a1] = intervalle(a), [b0, b1] = intervalle(b);
  return a0 < a1 && b0 < b1 && a0 < b1 && b0 < a1;
}

/** Réclames publiées du même type que `r` qui s'afficheraient en même temps qu'elle. */
export function concurrentes(r: Periode & { id?: string | null; kind: KindReclame }, toutes: Reclame[]): Reclame[] {
  return toutes.filter((x) => x.id !== r.id && x.kind === r.kind && x.status === 'published' && chevauchent(r, x));
}

/** Repasse en brouillon les concurrentes de `r` ; renvoie celles qui l'ont été. */
async function retirerConcurrentes(r: Periode & { id: string; kind: KindReclame }): Promise<Reclame[]> {
  const autres = concurrentes(r, await listReclames());
  for (const x of autres) await query(`UPDATE $id SET status = 'draft'`, { id: recId('reclame', x.id) });
  return autres;
}

export async function saveReclame(id: string | null, d: ReclameInput): Promise<{ id: string; retirees: Reclame[] }> {
  if (!d.title?.trim()) throw new Error('Le titre est requis.');
  const c = {
    kind: d.kind === 'modal' ? 'modal' : 'bandeau', status: d.status === 'published' ? 'published' : 'draft', title: d.title.trim(),
    message: d.message?.trim() || undefined, url: d.url?.trim() || undefined, cta_label: d.cta_label?.trim() || undefined,
    image: d.imageId ? recId('media', d.imageId.replace(/^media:/, '')) : undefined,
    variant: VARIANTS_BANDEAU[d.variant ?? ''] ? d.variant : 'info', frequency: FREQUENCES[d.frequency ?? ''] ? d.frequency : 'day',
    delay: Number.isFinite(d.delay) ? Math.min(60, Math.max(0, Math.round(d.delay!))) : 2,
    starts_at: d.starts_at ? new Date(d.starts_at) : undefined, ends_at: d.ends_at ? new Date(d.ends_at) : undefined
  };
  let rid = id;
  if (rid) await query(`UPDATE $id MERGE $c`, { id: recId('reclame', rid), c });
  else {
    const rows = await query<any>(`CREATE reclame CONTENT $c`, { c });
    rid = String(rows[0].id).replace(/^reclame:/, '');
  }
  const retirees = c.status === 'published' ? await retirerConcurrentes({ id: rid, kind: c.kind as KindReclame, starts_at: c.starts_at, ends_at: c.ends_at }) : [];
  return { id: rid, retirees };
}

/** Publie ou dépublie ; publier retire les concurrentes (renvoyées). */
export async function setStatutReclame(id: string, status: 'draft' | 'published'): Promise<Reclame[]> {
  let retirees: Reclame[] = [];
  if (status === 'published') {
    const r = await getReclame(id);
    if (!r) throw new Error('Réclame introuvable.');
    retirees = await retirerConcurrentes(r);
  }
  await query(`UPDATE $id SET status = $s`, { id: recId('reclame', id), s: status });
  return retirees;
}

export async function deleteReclame(id: string) {
  await query(`DELETE $id`, { id: recId('reclame', id) });
}

/** Ce que le site affiche maintenant : au plus un bandeau et une fenêtre. */
export async function reclamesActives(): Promise<{ bandeau: Reclame | null; modal: Reclame | null }> {
  const rows = await query<any>(`SELECT ${CHAMPS} FROM reclame WHERE status = 'published' ORDER BY created_at DESC`);
  const actives = rows.map(normaliser).filter((r: Reclame) => r.en_ligne);
  return { bandeau: actives.find((r: Reclame) => r.kind === 'bandeau') ?? null, modal: actives.find((r: Reclame) => r.kind === 'modal') ?? null };
}
