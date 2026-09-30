/**
 * Ventes par canal — la source unifiée des statistiques.
 *
 * Chaque canal du référentiel a sa source :
 *   - commandes du site (connecteur `orders`) : par mois, format et livre ;
 *   - Les Belles Lettres (connecteur `bldd`) : les mouvements de stock relevés
 *     mois par mois (ventes nettes des retours), au prix public du livre pour le
 *     chiffre ; à défaut le relevé annuel, rangé au mois 0 (« non ventilé ») ;
 *   - tableurs importés (mode manuel) : les lignes de leurs relevés, au mois du
 *     relevé s'il couvre un mois, sinon au mois 0.
 * Le mois 0 compte dans les totaux de l'année, pas dans la courbe mensuelle.
 */
import { query, recId } from './surreal';
import { listCanaux, seriesDe, type Canal, type SerieCanal } from './canaux';

const PAID = "['completed','paid','processing','sent_to_bl']";

export interface Point { key: string; annee: number; mois: number; units: number; ca: number; orders: number }
export interface PointLivre { key: string; book: string; title: string; slug: string; units: number; ca: number }

export interface VentesCanaux {
  series: SerieCanal[];
  points: Point[];
  livres: PointLivre[];
  formats: { key: string; format: 'paper' | 'ebook'; units: number; ca: number }[];
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const mensuel = (ps: string, pe: string) => {
  const a = new Date(ps), b = new Date(pe);
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
};

/**
 * Tout ce qui s'est vendu, par canal, mois, format et livre — pour une année
 * (ou toutes), éventuellement un seul livre. Les canaux désactivés n'y sont pas.
 */
export async function ventesParCanal(opts: { annee?: number; bookSlug?: string } = {}): Promise<VentesCanaux> {
  const canaux = await listCanaux({ enabledOnly: true });
  const series = seriesDe(canaux);
  const points: Point[] = [];
  const livres: PointLivre[] = [];
  const formats = new Map<string, { key: string; format: 'paper' | 'ebook'; units: number; ca: number }>();
  const ajouterFormat = (key: string, format: 'paper' | 'ebook', units: number, ca: number) => {
    const k = `${key}|${format}`;
    const f = formats.get(k) ?? { key, format, units: 0, ca: 0 };
    f.units += units; f.ca += ca;
    formats.set(k, f);
  };
  const annee = opts.annee;
  const surAnnee = (champ: string) => (annee ? ` AND time::year(${champ}) = $annee` : '');
  const vars: Record<string, unknown> = { annee, s: opts.bookSlug };

  await Promise.all(canaux.map(async (c) => {
    if (c.connector === 'orders' && c.order_channel) {
      const cle = (format: string) => (c.split_by_format ? `${c.code}:${format === 'epub' ? 'ebook' : 'paper'}` : c.code);
      const lignes = await query<any>(
        `SELECT time::year(in.created_at) AS a, time::month(in.created_at) AS m, format,
                math::sum(qty) AS units, math::sum(line_total) AS ca
           FROM contains WHERE in.status IN ${PAID} AND in.channel = $oc${surAnnee('in.created_at')}${opts.bookSlug ? ' AND out.slug = $s' : ''}
          GROUP BY a, m, format`,
        { ...vars, oc: c.order_channel }
      );
      for (const l of lignes) {
        const fmt: 'paper' | 'ebook' = l.format === 'epub' ? 'ebook' : 'paper';
        points.push({ key: cle(l.format), annee: l.a, mois: l.m, units: Number(l.units ?? 0), ca: Number(l.ca ?? 0), orders: 0 });
        ajouterFormat(cle(l.format), fmt, Number(l.units ?? 0), Number(l.ca ?? 0));
      }
      // Les commandes se comptent une fois par commande, pas par ligne.
      const cmds = await query<any>(
        `SELECT time::year(created_at) AS a, time::month(created_at) AS m, count() AS n
           FROM order WHERE status IN ${PAID} AND channel = $oc${surAnnee('created_at')}${opts.bookSlug ? ' AND ->contains->book.slug CONTAINS $s' : ''}
          GROUP BY a, m`,
        { ...vars, oc: c.order_channel }
      );
      for (const o of cmds) points.push({ key: c.split_by_format ? `${c.code}:paper` : c.code, annee: o.a, mois: o.m, units: 0, ca: 0, orders: Number(o.n ?? 0) });
      const parLivre = await query<any>(
        `SELECT out AS book, out.title AS title, out.slug AS slug, format, math::sum(qty) AS units, math::sum(line_total) AS ca
           FROM contains WHERE in.status IN ${PAID} AND in.channel = $oc${surAnnee('in.created_at')}${opts.bookSlug ? ' AND out.slug = $s' : ''}
          GROUP BY book, title, slug, format`,
        { ...vars, oc: c.order_channel }
      );
      for (const l of parLivre) livres.push({ key: cle(l.format), book: String(l.book), title: l.title, slug: l.slug, units: Number(l.units ?? 0), ca: Number(l.ca ?? 0) });
    } else if (c.connector === 'bldd') {
      const mvts = await query<any>(
        `SELECT period_start, period_end, book, book.title AS title, book.slug AS slug, book.price_paper AS prix,
                gross_sales, returns_credited
           FROM book_period_stock WHERE book != NONE${surAnnee('period_start')}${opts.bookSlug ? ' AND book.slug = $s' : ''}`,
        vars
      );
      // Une année relevée mois par mois se lit par mois ; sinon le relevé annuel, au mois 0.
      const anneesMensuelles = new Set(mvts.filter((m: any) => mensuel(m.period_start, m.period_end)).map((m: any) => new Date(m.period_start).getUTCFullYear()));
      const agr = new Map<string, Point>();
      const parLivre = new Map<string, PointLivre>();
      for (const m of mvts) {
        const a = new Date(m.period_start).getUTCFullYear();
        const estMois = mensuel(m.period_start, m.period_end);
        if (anneesMensuelles.has(a) ? !estMois : estMois) continue;
        const mois = estMois ? new Date(m.period_start).getUTCMonth() + 1 : 0;
        const units = Number(m.gross_sales ?? 0) + Number(m.returns_credited ?? 0);
        const ca = units * Number(m.prix ?? 0);
        const k = `${a}|${mois}`;
        const p = agr.get(k) ?? { key: c.code, annee: a, mois, units: 0, ca: 0, orders: 0 };
        p.units += units; p.ca += ca; agr.set(k, p);
        const pl = parLivre.get(String(m.book)) ?? { key: c.code, book: String(m.book), title: m.title, slug: m.slug, units: 0, ca: 0 };
        pl.units += units; pl.ca += ca; parLivre.set(String(m.book), pl);
        ajouterFormat(c.code, 'paper', units, ca);
      }
      points.push(...agr.values());
      livres.push(...parLivre.values());
    } else if (c.mode === 'manuel') {
      const lignes = await query<any>(
        `SELECT report.period_start AS ps, report.period_end AS pe, book, book.title AS title, book.slug AS slug, format,
                units_sold, units_returned, gross_ht, gross_price
           FROM sales_line WHERE report.channel = $ch${surAnnee('report.period_start')}${opts.bookSlug ? ' AND book.slug = $s' : ''}`,
        { ...vars, ch: recId('sales_channel', c.id) }
      );
      const agr = new Map<string, Point>();
      const parLivre = new Map<string, PointLivre>();
      for (const l of lignes) {
        if (!l.ps) continue;
        const a = new Date(l.ps).getUTCFullYear();
        const mois = mensuel(l.ps, l.pe ?? l.ps) ? new Date(l.ps).getUTCMonth() + 1 : 0;
        const units = Number(l.units_sold ?? 0) - Number(l.units_returned ?? 0);
        const ca = Number(l.gross_ht ?? 0) || Number(l.gross_price ?? 0) * units;
        const fmt: 'paper' | 'ebook' = l.format === 'ebook' || l.format === 'epub' ? 'ebook' : 'paper';
        const k = `${a}|${mois}`;
        const p = agr.get(k) ?? { key: c.code, annee: a, mois, units: 0, ca: 0, orders: 0 };
        p.units += units; p.ca += ca; agr.set(k, p);
        if (l.book) {
          const pl = parLivre.get(String(l.book)) ?? { key: c.code, book: String(l.book), title: l.title, slug: l.slug, units: 0, ca: 0 };
          pl.units += units; pl.ca += ca; parLivre.set(String(l.book), pl);
        }
        ajouterFormat(c.code, fmt, units, ca);
      }
      points.push(...agr.values());
      livres.push(...parLivre.values());
    }
    // API en veille : rien à lire, la série existe mais reste vide.
  }));

  return {
    series,
    points: points.map((p) => ({ ...p, ca: r2(p.ca) })),
    livres: livres.map((l) => ({ ...l, ca: r2(l.ca) })),
    formats: [...formats.values()].map((f) => ({ ...f, ca: r2(f.ca) }))
  };
}

/** Années pour lesquelles au moins un canal a quelque chose. */
export const anneesDisponibles = (v: VentesCanaux) => [...new Set(v.points.map((p) => p.annee))].sort((a, b) => b - a);
