import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/surreal';

// Journalise une décision de bannière cookies (sans PII — seulement les
// catégories accordées + le type de décision). Sert à mesurer le taux d'acceptation.
export const POST: RequestHandler = async ({ request }) => {
  try {
    const { marketing, analytics, decision } = await request.json();
    const d = typeof decision === 'string' ? decision : 'custom';
    await query('CREATE consent_event SET marketing = $m, analytics = $a, decision = $d', {
      m: marketing === true, a: analytics === true, d
    });
  } catch {
    // Ne jamais casser le flux de consentement si le log échoue.
  }
  return json({ ok: true });
};
