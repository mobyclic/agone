/** Pages éditoriales statiques (à propos, contact, CGV, mentions…). */
import { query } from './surreal';
import { sansScripts } from '$lib/text';

export async function getPageBySlug(slug: string): Promise<{ title: string; slug: string; body_html?: string } | null> {
  const rows = await query<any>(
    `SELECT title, slug, body_html FROM page WHERE slug = $slug AND status = 'published' LIMIT 1`,
    { slug }
  );
  const p = rows[0];
  return p ? { title: p.title, slug: p.slug, body_html: sansScripts(p.body_html) } : null;
}

/**
 * Enregistrement depuis l'édition en place (bouton « Éditer » sur la page
 * publique). Renvoie false si aucune page publiée ne porte ce slug.
 */
export async function savePage(slug: string, d: { title: string; body_html?: string }): Promise<boolean> {
  const body = d.body_html?.trim();
  const rows = await query<any>(
    `UPDATE page SET title = $title, body_html = ${body ? '$body' : 'NONE'}
      WHERE slug = $slug AND status = 'published' RETURN meta::id(id) AS id`,
    body ? { slug, title: d.title, body } : { slug, title: d.title }
  );
  return rows.length > 0;
}
