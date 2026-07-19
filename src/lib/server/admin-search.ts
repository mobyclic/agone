/**
 * Recherche rapide back-office : livres, auteurs, articles — accès direct à l'édition.
 */
import { query } from './surreal';

export interface QuickHit {
  type: 'book' | 'author' | 'article';
  id: string;
  label: string;
  sub?: string;
  href: string;
}

export async function adminQuickSearch(qRaw: string): Promise<QuickHit[]> {
  const q = (qRaw ?? '').trim().toLowerCase();
  if (q.length < 2) return [];
  const [books, authors, articles] = await Promise.all([
    query<any>(
      `SELECT meta::id(id) AS id, title, subtitle, published_at FROM book
        WHERE string::lowercase(title) CONTAINS $q OR (isbn_paper ?? '') CONTAINS $q
        ORDER BY published_at DESC LIMIT 6`,
      { q }
    ),
    query<any>(
      `SELECT meta::id(id) AS id, full_name, slug FROM author
        WHERE string::lowercase(full_name) CONTAINS $q ORDER BY full_name ASC LIMIT 6`,
      { q }
    ),
    query<any>(
      `SELECT meta::id(id) AS id, title, published_at FROM article
        WHERE string::lowercase(title) CONTAINS $q ORDER BY published_at DESC LIMIT 6`,
      { q }
    )
  ]);
  return [
    ...books.map((b) => ({
      type: 'book' as const,
      id: b.id,
      label: b.title,
      sub: b.subtitle ?? undefined,
      href: `/admin/catalogue/${b.id}`
    })),
    ...authors.map((a) => ({
      type: 'author' as const,
      id: a.id,
      label: a.full_name,
      href: `/admin/auteurs/${a.slug}`
    })),
    ...articles.map((a) => ({
      type: 'article' as const,
      id: a.id,
      label: a.title,
      href: `/admin/articles/${a.id}`
    }))
  ];
}
