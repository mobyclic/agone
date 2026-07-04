/** Menus de navigation (collections + rubriques blog) — cache 5 min. */
import { listCollections } from './catalogue';
import { listBlogRubriques } from './articles';

export interface NavMenus {
  collections: { name: string; slug: string }[];
  rubriques: { name: string; slug: string }[];
}

let cache: { at: number; data: NavMenus } | null = null;

export async function navMenus(): Promise<NavMenus> {
  if (cache && Date.now() - cache.at < 300_000) return cache.data;
  const [collections, rubriques] = await Promise.all([listCollections(), listBlogRubriques()]);
  const data: NavMenus = {
    collections: collections.map((c) => ({ name: c.name, slug: c.slug })),
    rubriques: rubriques.map((r) => ({ name: r.name, slug: r.slug }))
  };
  cache = { at: Date.now(), data };
  return data;
}
