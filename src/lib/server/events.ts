/**
 * Rencontres (événements) — liste à venir / passées + fiche.
 * Les lieux sont des `venue` réutilisables et géolocalisés.
 */
import { query } from './surreal';

export interface EventCard {
  title: string;
  slug: string;
  start_at?: string;
  end_at?: string;
  cover_url?: string;
  venue_name?: string;
  venue_city?: string;
  author_names: string[];
}

function toCard(r: any): EventCard {
  return {
    title: r.title,
    slug: r.slug,
    start_at: r.start_at ?? undefined,
    end_at: r.end_at ?? undefined,
    cover_url: r.cover_url ?? undefined,
    venue_name: r.venue_name ?? undefined,
    venue_city: r.venue_city ?? undefined,
    author_names: (r.author_names ?? []).filter(Boolean)
  };
}

const CARD = `
  title, slug, start_at, end_at, cover.url AS cover_url,
  venue.name AS venue_name, venue.city AS venue_city,
  authors.full_name AS author_names
`;

export async function listUpcoming(): Promise<EventCard[]> {
  const rows = await query<any>(
    `SELECT ${CARD} FROM event WHERE start_at != NONE AND start_at >= time::now() ORDER BY start_at ASC`
  );
  return rows.map(toCard);
}

export async function listPast(limit = 48): Promise<EventCard[]> {
  const rows = await query<any>(
    `SELECT ${CARD} FROM event WHERE start_at != NONE AND start_at < time::now() ORDER BY start_at DESC LIMIT $limit`,
    { limit }
  );
  return rows.map(toCard);
}

export interface EventDetail {
  title: string;
  slug: string;
  body_html?: string;
  cover_url?: string;
  start_at?: string;
  end_at?: string;
  venue?: {
    name: string;
    address?: string;
    city?: string;
    lat?: number;
    lng?: number;
    place_id?: string;
    event_count?: number;
    slug?: string;
  };
  authors: { full_name: string; slug: string }[];
  books: { title: string; slug: string }[];
}

export async function getEventBySlug(slug: string): Promise<EventDetail | null> {
  const rows = await query<any>(
    `SELECT title, slug, body_html, start_at, end_at, cover.url AS cover_url,
        venue.* AS venue,
        authors.{ full_name: full_name, slug: slug } AS authors,
        books.{ title: title, slug: slug } AS books
      FROM event WHERE slug = $slug LIMIT 1`,
    { slug }
  );
  const e = rows[0];
  if (!e) return null;
  return {
    title: e.title,
    slug: e.slug,
    body_html: e.body_html ?? undefined,
    cover_url: e.cover_url ?? undefined,
    start_at: e.start_at ?? undefined,
    end_at: e.end_at ?? undefined,
    venue: e.venue ?? undefined,
    authors: (e.authors ?? []).filter((a: any) => a?.slug),
    books: (e.books ?? []).filter((b: any) => b?.slug)
  };
}
