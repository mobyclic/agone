/**
 * Anciennes adresses du site WordPress → nouvelles.
 *
 * Les livres, auteurs et rencontres ont gardé leurs chemins (/livre/…,
 * /auteur/…, /rencontres/…). Restent : les articles de l'Antichambre, qui
 * vivaient à la racine (/mon-article/), les archives de rubrique (/inactualites/),
 * les listes de collection (/livres/elements/), et les pages WooCommerce.
 * Les slugs de l'ancien site mêlaient tirets et underscores : on essaie les deux.
 */
import { query } from './surreal';
import { ARTICLE_EN_LIGNE } from './articles';

const FIXES: Record<string, string> = {
  'mon-panier': '/panier',
  'checkout': '/checkout',
  'mon-compte': '/compte/commandes',
  'livres': '/catalogue',
  'shop': '/catalogue',
  'a-propos': '/a-propos'
};

const variantes = (slug: string) => [...new Set([slug, slug.replace(/_/g, '-'), slug.replace(/-/g, '_')])];

/** Cible d'une adresse à la racine (/quelque-chose) qui n'est pas une page statique. */
export async function cibleAncienneAdresse(slug: string): Promise<string | null> {
  const s = slug.replace(/\/+$/, '').toLowerCase();
  if (FIXES[s]) return FIXES[s];
  const v = variantes(s);
  const article = await query<any>(`SELECT slug FROM article WHERE slug IN $v AND ${ARTICLE_EN_LIGNE} LIMIT 1`, { v });
  if (article[0]) return `/article/${article[0].slug}`;
  const rubrique = await query<any>(`SELECT slug FROM rubrique WHERE slug IN $v LIMIT 1`, { v });
  if (rubrique[0]) return `/antichambre?rubrique=${rubrique[0].slug}`;
  const livre = await query<any>(
    `SELECT slug FROM book WHERE (slug IN $v OR array::any(old_slugs ?? [], |$o| $o IN $v)) AND status = 'published' LIMIT 1`, { v }
  );
  if (livre[0]) return `/livre/${livre[0].slug}`;
  const auteur = await query<any>(`SELECT slug FROM author WHERE slug IN $v LIMIT 1`, { v });
  if (auteur[0]) return `/auteur/${auteur[0].slug}`;
  return null;
}

/** Comparaison au plus lâche : « banc-dessais » et « banc-d-essais » sont la même collection. */
const squelette = (v: string) => v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

/** /livres/<collection>/ de l'ancien site → la collection, sinon le catalogue. */
export async function cibleAncienneCollection(slug: string): Promise<string> {
  const cible = squelette(slug);
  const collections = await query<any>(`SELECT slug, name FROM collection WHERE slug != NONE`);
  const c = collections.find((x: any) => squelette(String(x.slug)) === cible || squelette(String(x.name ?? '')) === cible);
  return c ? `/collections/${c.slug}` : '/catalogue';
}
