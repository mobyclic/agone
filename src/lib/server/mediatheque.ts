/**
 * Médiathèque : tous les fichiers déposés (table `media`), rangés par usage —
 * couvertures et galeries de livres, portraits d'auteurs, images de rencontres
 * et d'articles, images de l'éditeur, documents privés (contrats, factures,
 * carnets) — avec ce qui les utilise, pour retrouver un fichier et savoir s'il
 * peut être supprimé.
 */
import { query } from './surreal';
import { estPrive } from './storage';

export type UsageMedia = 'livres' | 'auteurs' | 'rencontres' | 'articles' | 'editeur' | 'documents' | 'autres';

export const USAGES: Record<UsageMedia, { label: string; prefixes: string[] }> = {
  livres: { label: 'Livres', prefixes: ['livres/'] },
  auteurs: { label: 'Auteurs', prefixes: ['auteurs/'] },
  rencontres: { label: 'Rencontres', prefixes: ['rencontres/'] },
  articles: { label: 'Antichambre', prefixes: ['blog/'] },
  editeur: { label: 'Images de l’éditeur', prefixes: ['media/editeur/'] },
  documents: { label: 'Documents', prefixes: ['contrats/', 'factures/', 'carnets/'] },
  autres: { label: 'Autres', prefixes: [] }
};

export interface MediaFiche {
  id: string; key: string; url: string; kind: string; mime?: string; filename?: string; size?: number; width?: number; height?: number; alt?: string; created_at: string;
  prive: boolean; image: boolean; usage: UsageMedia;
  /** Ce qui l'utilise : libellé + lien back-office. */
  liens: { label: string; href: string }[];
}

function usageDe(key: string): UsageMedia {
  for (const [u, d] of Object.entries(USAGES) as [UsageMedia, { prefixes: string[] }][]) if (d.prefixes.some((p) => key.startsWith(p))) return u;
  return 'autres';
}

export async function listMedias(opts: { usage?: UsageMedia; q?: string; limit?: number; offset?: number } = {}) {
  const where: string[] = [];
  const vars: Record<string, unknown> = { limit: opts.limit ?? 48, start: opts.offset ?? 0 };
  if (opts.usage && opts.usage !== 'autres') {
    const prefs = USAGES[opts.usage].prefixes;
    where.push('(' + prefs.map((_, i) => `string::starts_with(key, $p${i})`).join(' OR ') + ')');
    prefs.forEach((p, i) => (vars[`p${i}`] = p));
  } else if (opts.usage === 'autres') {
    const tous = Object.values(USAGES).flatMap((u) => u.prefixes);
    where.push('(' + tous.map((_, i) => `string::starts_with(key, $p${i}) = false`).join(' AND ') + ')');
    tous.forEach((p, i) => (vars[`p${i}`] = p));
  }
  if (opts.q?.trim()) { vars.q = opts.q.trim().toLowerCase(); where.push("(string::lowercase(filename ?? '') CONTAINS $q OR string::lowercase(key) CONTAINS $q OR string::lowercase(alt ?? '') CONTAINS $q)"); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, key, url, kind, mime, filename, size, width, height, alt, created_at,
            (SELECT meta::id(id) AS id, title, slug FROM book WHERE cover = $parent.id LIMIT 1)[0] AS couv,
            (SELECT meta::id(id) AS id, title, slug FROM book WHERE gallery CONTAINS $parent.id LIMIT 1)[0] AS galerie,
            (SELECT meta::id(id) AS id, full_name, slug FROM author WHERE portrait = $parent.id LIMIT 1)[0] AS auteur,
            (SELECT meta::id(id) AS id, title FROM event WHERE cover = $parent.id LIMIT 1)[0] AS rencontre,
            (SELECT meta::id(id) AS id, title FROM article WHERE cover = $parent.id LIMIT 1)[0] AS article,
            (SELECT meta::id(id) AS id, ref FROM invoice WHERE document = $parent.id LIMIT 1)[0] AS facture
       FROM media ${w} ORDER BY created_at DESC LIMIT $limit START $start`, vars);
  const count = await query<any>(`SELECT count() AS n FROM media ${w} GROUP ALL`, vars);
  const medias: MediaFiche[] = rows.map((r: any) => {
    const liens: { label: string; href: string }[] = [];
    if (r.couv) liens.push({ label: `Couverture · ${r.couv.title}`, href: `/admin/catalogue/${r.couv.slug ?? r.couv.id}` });
    if (r.galerie) liens.push({ label: `Galerie · ${r.galerie.title}`, href: `/admin/catalogue/${r.galerie.slug ?? r.galerie.id}` });
    if (r.auteur) liens.push({ label: `Portrait · ${r.auteur.full_name}`, href: `/admin/auteurs/${r.auteur.slug ?? r.auteur.id}` });
    if (r.rencontre) liens.push({ label: `Rencontre · ${r.rencontre.title}`, href: `/admin/rencontres/${r.rencontre.id}` });
    if (r.article) liens.push({ label: `Article · ${r.article.title}`, href: `/admin/articles/${r.article.id}` });
    if (r.facture) liens.push({ label: `Facture ${r.facture.ref}`, href: `/admin/factures/${r.facture.id}` });
    const key = String(r.key ?? '');
    return {
      id: String(r.id), key, url: r.url, kind: r.kind ?? 'image', mime: r.mime ?? undefined, filename: r.filename ?? undefined, size: r.size ?? undefined,
      width: r.width ?? undefined, height: r.height ?? undefined, alt: r.alt ?? undefined, created_at: r.created_at,
      prive: estPrive(key), image: String(r.mime ?? '').startsWith('image/') || /\.(webp|jpe?g|png|gif|avif)$/i.test(key), usage: usageDe(key), liens
    };
  });
  return { medias, total: Number(count[0]?.n ?? 0) };
}

/** Nombre de fichiers par usage, pour les onglets. */
export async function comptesParUsage(): Promise<Record<UsageMedia, number>> {
  const rows = await query<any>(`SELECT key FROM media`);
  const out = Object.fromEntries(Object.keys(USAGES).map((u) => [u, 0])) as Record<UsageMedia, number>;
  for (const r of rows) out[usageDe(String(r.key ?? ''))]++;
  return out;
}
