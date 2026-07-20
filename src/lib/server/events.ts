/**
 * Rencontres (événements) — liste à venir / passées + fiche + back-office.
 * Les lieux sont des `venue` réutilisables et géolocalisés.
 */
import { query, recId } from './surreal';
import { uniqueSlug } from './slug';
import { geocodeAddress } from './geocode';
import { GeometryPoint } from 'surrealdb';

export interface EventCard {
  title: string;
  slug: string;
  start_at?: string;
  end_at?: string;
  cover_url?: string;
  venue_name?: string;
  venue_city?: string;
  venue_lat?: number;
  venue_lng?: number;
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
    venue_lat: r.venue_lat ?? undefined,
    venue_lng: r.venue_lng ?? undefined,
    author_names: (r.author_names ?? []).filter(Boolean)
  };
}

const CARD = `
  title, slug, start_at, end_at, cover.url AS cover_url,
  venue.name AS venue_name, venue.city AS venue_city,
  venue.lat AS venue_lat, venue.lng AS venue_lng,
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
  id: string;
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
    `SELECT meta::id(id) AS pid, title, slug, body_html, start_at, end_at, cover.url AS cover_url,
        venue.* AS venue,
        authors.{ full_name: full_name, slug: slug } AS authors,
        books.{ title: title, slug: slug } AS books
      FROM event WHERE slug = $slug LIMIT 1`,
    { slug }
  );
  const e = rows[0];
  if (!e) return null;
  return {
    id: e.pid,
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

/* ————————————————————— Back-office ————————————————————— */

const plainId = (v: unknown, table: string) => String(v).replace(new RegExp(`^${table}:`), '');

export async function listEventsAdmin(opts: { q?: string; when?: string; limit?: number; offset?: number } = {}) {
  const where: string[] = [];
  const vars: Record<string, unknown> = { limit: opts.limit ?? 50, start: opts.offset ?? 0 };
  if (opts.when === 'upcoming') where.push('start_at != NONE AND start_at >= time::now()');
  else if (opts.when === 'past') where.push('start_at != NONE AND start_at < time::now()');
  if (opts.q && opts.q.trim()) { vars.q = opts.q.trim().toLowerCase(); where.push('string::lowercase(title) CONTAINS $q'); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order = opts.when === 'past' ? 'start_at DESC' : 'start_at ASC';
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, title, slug, start_at,
        venue.name AS venue_name, venue.city AS venue_city
      FROM event ${whereSql} ORDER BY ${order} LIMIT $limit START $start`,
    vars
  );
  const count = await query<any>(`SELECT count() AS n FROM event ${whereSql} GROUP ALL`, vars);
  return { events: rows, total: count[0]?.n ?? 0 };
}

/** Recherche de lieux (pour le sélecteur de la fiche rencontre). */
export async function searchVenues(qRaw: string): Promise<{ id: string; name: string; city?: string }[]> {
  const q = (qRaw ?? '').trim().toLowerCase();
  if (q.length < 2) return [];
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, name, city FROM venue
       WHERE string::lowercase(name) CONTAINS $q OR string::lowercase(city ?? '') CONTAINS $q
       ORDER BY name ASC LIMIT 8`,
    { q }
  );
  return rows.map((r) => ({ id: r.id, name: r.name, city: r.city ?? undefined }));
}

export interface EventEdit {
  id: string;
  title: string;
  slug: string;
  body_html?: string;
  cover_id?: string;
  cover_url?: string;
  start_at?: string;
  end_at?: string;
  venue_id?: string;
  venue_label?: string;
  authors: { id: string; label: string }[];
  books: { id: string; label: string }[];
}

export async function getEventForEdit(id: string): Promise<EventEdit | null> {
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, title, slug, body_html,
        cover AS cover_ref, cover.url AS cover_url, start_at, end_at,
        venue AS venue_ref, venue.name AS venue_name, venue.city AS venue_city,
        authors.{ id: id, label: full_name } AS authors,
        books.{ id: id, label: title } AS books
      FROM event WHERE id = $id LIMIT 1`,
    { id: recId('event', id) }
  );
  const e = rows[0];
  if (!e) return null;
  return {
    id: e.id,
    title: e.title,
    slug: e.slug,
    body_html: e.body_html ?? undefined,
    cover_id: e.cover_ref ? plainId(e.cover_ref, 'media') : undefined,
    cover_url: e.cover_url ?? undefined,
    start_at: e.start_at ?? undefined,
    end_at: e.end_at ?? undefined,
    venue_id: e.venue_ref ? plainId(e.venue_ref, 'venue') : undefined,
    venue_label: e.venue_name ? `${e.venue_name}${e.venue_city ? `, ${e.venue_city}` : ''}` : undefined,
    authors: (e.authors ?? []).filter((x: any) => x?.id).map((x: any) => ({ id: String(x.id), label: x.label ?? '—' })),
    books: (e.books ?? []).filter((x: any) => x?.id).map((x: any) => ({ id: String(x.id), label: x.label ?? '—' }))
  };
}

export interface EventInput {
  title: string;
  body_html?: string;
  coverId?: string;
  start_at?: string; // ISO
  end_at?: string; // ISO
  venueId?: string;
  newVenue?: { name: string; street?: string; city?: string; post_code?: string; country?: string; lat?: number; lng?: number };
  authorIds: string[];
  bookIds: string[];
}

/** Résout le lieu : existant (id) ou création d'un nouveau venue. */
async function resolveVenueId(input: EventInput): Promise<string | undefined> {
  if (input.venueId) return input.venueId;
  const v = input.newVenue;
  if (!v || !v.name?.trim()) return undefined;
  // Géocodage auto si coordonnées manquantes mais adresse renseignée.
  if ((v.lat == null || v.lng == null) && (v.street || v.city)) {
    const q = [v.street, `${v.post_code ?? ''} ${v.city ?? ''}`.trim(), v.country].map((s) => (s ?? '').trim()).filter(Boolean).join(', ');
    const geo = await geocodeAddress(q);
    if (geo) { v.lat = geo.lat; v.lng = geo.lng; }
  }
  const slug = await uniqueSlug('venue', v.name);
  const content: Record<string, unknown> = {
    name: v.name.trim(), slug,
    street: v.street?.trim() || undefined,
    city: v.city?.trim() || undefined,
    post_code: v.post_code?.trim() || undefined,
    country: v.country?.trim() || undefined,
    address: [v.street, v.post_code, v.city, v.country].map((x) => x?.trim()).filter(Boolean).join(', ') || undefined,
    lat: v.lat, lng: v.lng
  };
  if (v.lat != null && v.lng != null) content.geo = new GeometryPoint([v.lng, v.lat]);
  for (const k of Object.keys(content)) if (content[k] === undefined) delete content[k];
  const rows = await query<any>(`CREATE venue CONTENT $c`, { c: content });
  return plainId(rows[0].id, 'venue');
}

export async function saveEvent(id: string | null, input: EventInput): Promise<string> {
  const venueId = await resolveVenueId(input);
  const set: string[] = ['title = $title'];
  const vars: Record<string, unknown> = { title: input.title.trim() };
  const opt = (field: string, val: unknown, expr?: string) => {
    if (val === undefined || val === null || val === '') set.push(`${field} = NONE`);
    else { vars[field] = val; set.push(`${field} = ${expr ?? `$${field}`}`); }
  };
  opt('body_html', input.body_html?.trim() || undefined);
  opt('cover', input.coverId ? recId('media', input.coverId) : undefined);
  opt('start_at', input.start_at || undefined, 'type::datetime($start_at)');
  opt('end_at', input.end_at || undefined, 'type::datetime($end_at)');
  opt('venue', venueId ? recId('venue', venueId) : undefined);
  vars.authors = input.authorIds.map((a) => recId('author', a));
  vars.books = input.bookIds.map((b) => recId('book', b));
  set.push('authors = $authors', 'books = $books');

  if (id) {
    await query(`UPDATE $id SET ${set.join(', ')}`, { ...vars, id: recId('event', id) });
    return id;
  }
  vars.slug = await uniqueSlug('event', input.title);
  set.push('slug = $slug');
  const rows = await query<any>(`CREATE event SET ${set.join(', ')}`, vars);
  return plainId(rows[0].id, 'event');
}

export async function deleteEvent(id: string): Promise<void> {
  await query(`DELETE $id`, { id: recId('event', id) });
}
