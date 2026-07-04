/** Pages éditoriales statiques (à propos, contact, CGV, mentions…). */
import { query } from './surreal';

export async function getPageBySlug(slug: string): Promise<{ title: string; slug: string; body_html?: string } | null> {
  const rows = await query<any>(
    `SELECT title, slug, body_html FROM page WHERE slug = $slug AND status = 'published' LIMIT 1`,
    { slug }
  );
  const p = rows[0];
  return p ? { title: p.title, slug: p.slug, body_html: p.body_html ?? undefined } : null;
}
