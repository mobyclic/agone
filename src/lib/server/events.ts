/**
 * Rencontres (événements) — liste à venir / passées + fiche + back-office.
 * Les lieux sont des `venue` réutilisables et géolocalisés.
 */
import { query, recId } from './surreal';
import { sansScripts, notesDeBasDePage } from '$lib/text';
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
    body_html: notesDeBasDePage(sansScripts(e.body_html)),
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
export async function searchVenues(qRaw: string): Promise<{ id: string; name: string; city?: string; lat?: number; lng?: number }[]> {
  const q = (qRaw ?? '').trim().toLowerCase();
  if (q.length < 2) return [];
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, name, city, lat, lng FROM venue
       WHERE string::lowercase(name) CONTAINS $q OR string::lowercase(city ?? '') CONTAINS $q
       ORDER BY name ASC LIMIT 8`,
    { q }
  );
  return rows.map((r) => ({ id: r.id, name: r.name, city: r.city ?? undefined, lat: r.lat ?? undefined, lng: r.lng ?? undefined }));
}

/** Affine la position d'un lieu existant (lat/lng + point geo). */
/**
 * Contact d'un lieu (téléphone, site, description). Le lieu étant PARTAGÉ entre
 * rencontres, la saisie depuis une fiche rencontre modifie bien le lieu pour
 * toutes — c'est voulu : ces informations décrivent le lieu, pas l'événement.
 * Un champ laissé vide efface la valeur (l'utilisateur voit ce qu'il enregistre).
 */
export async function updateVenueContact(
  venueId: string,
  d: { phone?: string; website?: string; description?: string }
): Promise<void> {
  const set: string[] = [];
  const vars: Record<string, unknown> = {};
  for (const champ of ['phone', 'website', 'description'] as const) {
    const v = d[champ]?.trim();
    if (v) { vars[champ] = v; set.push(`${champ} = $${champ}`); }
    else set.push(`${champ} = NONE`);
  }
  await query(`UPDATE $id SET ${set.join(', ')}`, { ...vars, id: recId('venue', venueId) });
}

export async function updateVenuePosition(venueId: string, lat: number, lng: number): Promise<void> {
  await query(`UPDATE $id SET lat = $lat, lng = $lng, geo = $geo`, {
    id: recId('venue', venueId),
    lat,
    lng,
    geo: new GeometryPoint([lng, lat])
  });
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
  venue_lat?: number;
  venue_lng?: number;
  venue_phone?: string;
  venue_website?: string;
  venue_description?: string;
  authors: { id: string; label: string }[];
  books: { id: string; label: string }[];
}

export async function getEventForEdit(id: string): Promise<EventEdit | null> {
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, title, slug, body_html,
        cover AS cover_ref, cover.url AS cover_url, start_at, end_at,
        venue AS venue_ref, venue.name AS venue_name, venue.city AS venue_city,
        venue.lat AS venue_lat, venue.lng AS venue_lng,
        venue.phone AS venue_phone, venue.website AS venue_website,
        venue.description AS venue_description,
        authors.{ id: id, label: full_name, image: portrait.url } AS authors,
        books.{ id: id, label: title, image: cover.url } AS books
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
    venue_lat: e.venue_lat ?? undefined,
    venue_lng: e.venue_lng ?? undefined,
    venue_phone: e.venue_phone ?? undefined,
    venue_website: e.venue_website ?? undefined,
    venue_description: e.venue_description ?? undefined,
    authors: (e.authors ?? []).filter((x: any) => x?.id).map((x: any) => ({ id: String(x.id), label: x.label ?? '—', image: x.image ?? undefined })),
    books: (e.books ?? []).filter((x: any) => x?.id).map((x: any) => ({ id: String(x.id), label: x.label ?? '—', image: x.image ?? undefined }))
  };
}

export interface EventInput {
  title: string;
  body_html?: string;
  coverId?: string;
  start_at?: string; // ISO
  end_at?: string; // ISO
  venueId?: string;
  newVenue?: { name: string; street?: string; city?: string; post_code?: string; country?: string; lat?: number; lng?: number;
    phone?: string; website?: string; description?: string };
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
    phone: v.phone?.trim() || undefined,
    website: v.website?.trim() || undefined,
    description: v.description?.trim() || undefined,
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

// ── AGENDA DÉPLIANT DE L'ACCUEIL ──────────────────────────────────────────
// La section Rencontres de l'accueil porte TOUTES les rencontres à venir, la
// liste et la carte se répondant : ouvrir une fiche zoome la carte, cliquer un
// point ouvre la fiche. Elle a donc besoin du détail du lieu D'EMBLÉE — un
// aller-retour serveur par clic ferait clignoter la carte pour rien.

export interface UpcomingEntry {
  slug: string;
  title: string;
  start_at?: string;
  end_at?: string;
  excerpt?: string;
  author_names: string[];
  venue?: {
    name?: string;
    address?: string;
    city?: string;
    post_code?: string;
    country?: string;
    phone?: string;
    website?: string;
    description?: string;
    lat?: number;
    lng?: number;
  };
}

/** Texte nu d'un corps HTML, tronqué proprement sur un mot. */
function extraitTexte(html: string | undefined, max = 260): string | undefined {
  if (!html) return undefined;
  const nu = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  if (!nu) return undefined;
  if (nu.length <= max) return nu;
  const coupe = nu.slice(0, max);
  const espace = coupe.lastIndexOf(' ');
  return (espace > 60 ? coupe.slice(0, espace) : coupe) + '…';
}

export async function listUpcomingWithVenues(): Promise<UpcomingEntry[]> {
  const rows = await query<any>(
    `SELECT title, slug, start_at, end_at, body_html,
        venue.name AS v_name, venue.address AS v_address, venue.city AS v_city,
        venue.post_code AS v_post_code, venue.country AS v_country,
        venue.phone AS v_phone, venue.website AS v_website,
        venue.description AS v_description,
        venue.lat AS v_lat, venue.lng AS v_lng,
        authors.full_name AS author_names
      FROM event WHERE start_at != NONE AND start_at >= time::now() ORDER BY start_at ASC`
  );
  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    start_at: r.start_at ?? undefined,
    end_at: r.end_at ?? undefined,
    excerpt: extraitTexte(r.body_html ?? undefined),
    author_names: (r.author_names ?? []).filter(Boolean),
    venue: r.v_name
      ? {
          name: r.v_name ?? undefined,
          address: r.v_address ?? undefined,
          city: r.v_city ?? undefined,
          post_code: r.v_post_code ?? undefined,
          country: r.v_country ?? undefined,
          phone: r.v_phone ?? undefined,
          website: r.v_website ?? undefined,
          description: r.v_description ?? undefined,
          lat: typeof r.v_lat === 'number' ? r.v_lat : undefined,
          lng: typeof r.v_lng === 'number' ? r.v_lng : undefined
        }
      : undefined
  }));
}

/* ————————————————————— Rencontres à venir liées (fiches livre & auteur) ————————————————————— */

const nu = (id: string, table: string) => String(id).replace(new RegExp(`^${table}:`), '');

/**
 * Rencontres à venir d'un livre : celles qui citent le livre, ou l'un de ses
 * AUTEURS (rôle author — une rencontre du préfacier sur un autre sujet n'a pas
 * sa place sur la fiche).
 */
export async function upcomingForBook(bookId: string): Promise<EventCard[]> {
  const b = recId('book', nu(bookId, 'book'));
  const auteurs = await query<string>(`SELECT VALUE out FROM contributed_by WHERE in = $b AND role = 'author'`, { b });
  const au = auteurs.map((x) => recId('author', nu(x, 'author')));
  const rows = await query<any>(
    `SELECT ${CARD} FROM event
       WHERE start_at != NONE AND start_at >= time::now()
         AND ($b INSIDE (books ?? []) OR (authors ?? []) ANYINSIDE $au)
       ORDER BY start_at ASC LIMIT 12`,
    { b, au }
  );
  return rows.map(toCard);
}

/** Rencontres à venir d'un auteur : où il est invité, ou qui citent l'un de ses livres. */
export async function upcomingForAuthor(authorId: string): Promise<EventCard[]> {
  const a = recId('author', nu(authorId, 'author'));
  const livres = await query<string>(`SELECT VALUE in FROM contributed_by WHERE out = $a AND role = 'author'`, { a });
  const bk = livres.map((x) => recId('book', nu(x, 'book')));
  const rows = await query<any>(
    `SELECT ${CARD} FROM event
       WHERE start_at != NONE AND start_at >= time::now()
         AND ($a INSIDE (authors ?? []) OR (books ?? []) ANYINSIDE $bk)
       ORDER BY start_at ASC LIMIT 12`,
    { a, bk }
  );
  return rows.map(toCard);
}
