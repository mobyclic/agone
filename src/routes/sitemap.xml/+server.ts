import type { RequestHandler } from './$types';
import { query } from '$lib/server/surreal';
import { ARTICLE_EN_LIGNE } from '$lib/server/articles';

/**
 * Plan du site pour les moteurs : tout ce qui est public et en ligne. Les
 * brouillons, les livres non publiés et les articles programmés n'y figurent
 * pas — ils renvoient 404 au public.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: RequestHandler = async ({ url }) => {
  const base = url.origin.includes('localhost') ? 'https://agone.org' : url.origin;
  const [books, authors, articles, events, collections, pages] = await Promise.all([
    query<any>(`SELECT slug, updated_at FROM book WHERE status = 'published' AND slug != NONE`),
    query<any>(`SELECT slug, updated_at FROM author WHERE slug != NONE`),
    query<any>(`SELECT slug, updated_at FROM article WHERE ${ARTICLE_EN_LIGNE} AND slug != NONE`),
    query<any>(`SELECT slug, updated_at FROM event WHERE slug != NONE`),
    query<any>(`SELECT slug FROM collection WHERE slug != NONE`),
    query<any>(`SELECT slug, updated_at FROM page WHERE status = 'published' AND slug != NONE`)
  ]);

  const entrees: { loc: string; lastmod?: string; priority: string }[] = [
    { loc: '/', priority: '1.0' },
    { loc: '/catalogue', priority: '0.9' },
    { loc: '/auteurs', priority: '0.7' },
    { loc: '/rencontres', priority: '0.7' },
    { loc: '/antichambre', priority: '0.8' },
    { loc: '/a-paraitre', priority: '0.6' },
    { loc: '/contact', priority: '0.3' }
  ];
  const jour = (d?: string) => (d ? new Date(d).toISOString().slice(0, 10) : undefined);
  for (const c of collections) entrees.push({ loc: `/collections/${c.slug}`, priority: '0.7' });
  for (const b of books) entrees.push({ loc: `/livre/${b.slug}`, lastmod: jour(b.updated_at), priority: '0.8' });
  for (const a of authors) entrees.push({ loc: `/auteur/${a.slug}`, lastmod: jour(a.updated_at), priority: '0.5' });
  for (const a of articles) entrees.push({ loc: `/article/${a.slug}`, lastmod: jour(a.updated_at), priority: '0.6' });
  for (const e of events) entrees.push({ loc: `/rencontres/${e.slug}`, lastmod: jour(e.updated_at), priority: '0.4' });
  for (const p of pages) entrees.push({ loc: `/${p.slug}`, lastmod: jour(p.updated_at), priority: '0.3' });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entrees.map((e) => `  <url><loc>${esc(base + e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}<priority>${e.priority}</priority></url>`).join('\n')}
</urlset>`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
  });
};
