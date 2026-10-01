import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/access';
import { lignesCanal, modifierLigne, modifierNoteCommande } from '$lib/server/ventesLignes';
import { journaliser } from '$lib/server/journal';

/** Une page de lignes de ventes d'un canal (tri, filtre, pagination côté serveur). */
export const GET: RequestHandler = async ({ url, locals }) => {
  requireAdmin(locals);
  const p = url.searchParams;
  const code = p.get('canal') ?? '';
  if (!code) throw error(400, { message: 'canal manquant' });
  try {
    return json(await lignesCanal({
      code, annee: Number(p.get('annee')) || new Date().getUTCFullYear(),
      page: Number(p.get('page')) || 1, parPage: Number(p.get('parPage')) || 50,
      tri: (p.get('tri') as any) || 'date', dir: p.get('dir') === 'asc' ? 'asc' : 'desc',
      q: p.get('q') ?? '', format: p.get('format') ?? ''
    }));
  } catch (e) {
    throw error(400, { message: e instanceof Error ? e.message : 'Lecture impossible' });
  }
};

/** Correction d'une ligne : { type: 'line', id, ...champs } ou { type: 'order', number, note }. */
export const PATCH: RequestHandler = async ({ request, locals }) => {
  requireAdmin(locals);
  const b = await request.json().catch(() => ({}));
  if (b?.type === 'line' && b.id) {
    const { type: _t, id, ...champs } = b;
    await modifierLigne(String(id), champs);
    await journaliser(locals, { action: 'vente.corrigee', cible: { type: 'sales_line', id: String(id), libelle: 'Ligne de vente' }, details: champs });
    return json({ ok: true });
  }
  if (b?.type === 'order' && b.number) {
    await modifierNoteCommande(Number(b.number), b.note ?? null);
    return json({ ok: true });
  }
  throw error(400, { message: 'Requête incomplète' });
};
