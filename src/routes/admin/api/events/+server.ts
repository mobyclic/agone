import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/access';
import { listEventsAdmin } from '$lib/server/events';

/** Recherche de rencontres par titre (rattachement d'une commande). */
export const GET: RequestHandler = async ({ url, locals }) => {
  requireStaff(locals);
  const q = url.searchParams.get('q') ?? '';
  if (q.trim().length < 2) return json({ results: [] });
  const { events } = await listEventsAdmin({ q, when: 'past', limit: 8 });
  const { events: futures } = await listEventsAdmin({ q, when: 'upcoming', limit: 4 });
  return json({ results: [...futures, ...events].map((e: any) => ({ id: e.id, title: e.title, start_at: e.start_at, venue: [e.venue_name, e.venue_city].filter(Boolean).join(', ') })) });
};
