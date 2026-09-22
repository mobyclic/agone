import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { getSetting, setSetting } from '$lib/server/site';
import { getCompany } from '$lib/server/invoice';
import { wpConfigured } from '$lib/server/wp-db';
import {
  importUsers, importOrders, importAuthors, importArticles, importBooks, importEvents,
  type ImportResult, type ImportOpts
} from '$lib/server/migration';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async () => {
  const [contact, banner, company, tracking, syncState] = await Promise.all([
    getSetting('contact'), getSetting('banner'), getCompany(), getSetting('tracking'), getSetting('sync_state')
  ]);
  const c = (contact ?? {}) as Record<string, any>;
  const b = (banner ?? {}) as Record<string, any>;
  const t = (tracking ?? {}) as Record<string, any>;
  const msg = b.message;
  return {
    wpReady: wpConfigured(),
    contact: { email: String(c.email ?? ''), phone: String(c.phone ?? ''), address: String(c.address ?? '') },
    banner: {
      active: b.active === true,
      message: typeof msg === 'object' && msg ? String(msg.fr ?? '') : String(msg ?? ''),
      variant: typeof b.variant === 'string' ? b.variant : 'info'
    },
    tracking: { gtm_id: String(t.gtm_id ?? ''), ga_id: String(t.ga_id ?? ''), meta_pixel_id: String(t.meta_pixel_id ?? '') },
    syncState: (syncState ?? {}) as Record<string, any>,
    company
  };
};

/**
 * Ordre de synchronisation — il n'est PAS arbitraire : chaque étape s'appuie sur
 * ce que les précédentes ont posé.
 *   1. Auteurs      — aucune dépendance.
 *   2. Livres       — arêtes contributed_by → auteurs.
 *   3. Articles     — liés aux auteurs et aux livres.
 *   4. Rencontres   — auteurs, livres, lieux.
 *   5. Utilisateurs — comptes clients.
 *   6. Commandes    — rattachées aux comptes (5) et aux livres (2).
 */
const ETAPES: { key: string; label: string; fn: (o: ImportOpts) => Promise<ImportResult>; limit?: number }[] = [
  { key: 'authors', label: 'Auteurs', fn: importAuthors },
  { key: 'books', label: 'Livres', fn: importBooks },
  { key: 'articles', label: 'Articles', fn: importArticles },
  { key: 'events', label: 'Rencontres', fn: importEvents },
  // Comptes : WordPress ne date pas leurs modifications → balayage complet en un seul lot.
  { key: 'users', label: 'Utilisateurs', fn: importUsers, limit: 5000 },
  { key: 'orders', label: 'Commandes', fn: importOrders }
];

/**
 * Une étape, en incrémental : on repart du curseur mémorisé (`sync_state`), sauf
 * demande explicite de tout réimporter. Le curseur n'est réécrit qu'après un
 * import réel et réussi — jamais en simulation, jamais s'il reculerait.
 */
async function syncEtape(key: string, fn: (o: ImportOpts) => Promise<ImportResult>, opts: { limit: number; dryRun: boolean; full: boolean }) {
  const state = ((await getSetting('sync_state')) ?? {}) as Record<string, any>;
  const prev = state[key]?.watermark ? new Date(String(state[key].watermark)) : null;

  // Lots successifs jusqu'à épuisement. Chaque import lit les enregistrements
  // modifiés depuis le curseur, du plus ancien au plus récent, par lots de
  // `limit` : un seul lot ne voyait donc que les PLUS ANCIENS — sans curseur
  // mémorisé (premier import, ou simulation, qui n'enregistre jamais le sien),
  // les 2000 premières commandes de 2015 revenaient à chaque fois, toutes déjà
  // connues, et les nouvelles n'étaient jamais lues (« 0 créée »). Le curseur
  // avance donc en mémoire de lot en lot, simulation comprise.
  const MAX_LOTS = 50;
  let curseur: Date | null = opts.full ? null : prev;
  const total: ImportResult = { type: key, fetched: 0, created: 0, updated: 0, skipped: 0, warnings: [], dryRun: opts.dryRun };
  for (let lot = 0; lot < MAX_LOTS; lot++) {
    const r = await fn({ limit: opts.limit, dryRun: opts.dryRun, since: curseur });
    total.type = r.type;
    total.fetched += r.fetched; total.created += r.created; total.updated += r.updated; total.skipped += r.skipped;
    for (const w of r.warnings) if (total.warnings.length < 200) total.warnings.push(w);
    if (r.fullScan) total.fullScan = true;
    if (r.watermark) total.watermark = r.watermark;
    // Fin : lot incomplet, source sans date (balayage complet), ou curseur figé
    // (plus de `limit` enregistrements modifiés dans la même seconde).
    const suivant = r.watermark ? new Date(r.watermark) : null;
    if (r.fetched < opts.limit || r.fullScan || !suivant || (curseur && suivant <= curseur)) break;
    curseur = suivant;
  }

  if (!opts.dryRun) {
    const next = total.watermark ?? state[key]?.watermark;
    // Un import vide laisse le curseur intact ; il ne recule jamais.
    const keep = prev && next && new Date(next) < prev ? prev.toISOString() : next;
    await setSetting('sync_state', {
      ...state,
      [key]: {
        at: new Date().toISOString(),
        watermark: keep ?? null,
        fetched: total.fetched,
        created: total.created,
        updated: total.updated,
        full_scan: total.fullScan === true
      }
    });
  }
  return total;
}

export const actions: Actions = {
  contact: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    await setSetting('contact', {
      email: String(fd.get('email') ?? '').trim(),
      phone: String(fd.get('phone') ?? '').trim(),
      address: String(fd.get('address') ?? '').trim()
    });
    throw redirect(303, withFlash('/admin/parametres', 'Coordonnées enregistrées.', 'success'));
  },

  tracking: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    await setSetting('tracking', {
      gtm_id: String(fd.get('gtm_id') ?? '').trim(),
      ga_id: String(fd.get('ga_id') ?? '').trim(),
      meta_pixel_id: String(fd.get('meta_pixel_id') ?? '').trim()
    });
    throw redirect(303, withFlash('/admin/parametres', 'Traceurs enregistrés.', 'success'));
  },

  banner: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    await setSetting('banner', {
      active: fd.get('active') === 'on',
      message: String(fd.get('message') ?? '').trim(),
      variant: String(fd.get('variant') ?? 'info')
    });
    throw redirect(303, withFlash('/admin/parametres', 'Bannière enregistrée.', 'success'));
  },

  billing: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const S = (k: string) => String(fd.get(k) ?? '').trim();
    const vatRates = S('vat_rates')
      .split(',')
      .map((x) => Number(x.trim().replace(',', '.')))
      .filter((n) => !Number.isNaN(n) && n >= 0);
    await setSetting('billing', {
      legal_name: S('legal_name'), address: S('address'), siret: S('siret'), vat_number: S('vat_number'),
      rcs: S('rcs'), ape: S('ape'), iban: S('iban'), bic: S('bic'), email: S('email'), phone: S('phone'),
      capital: S('capital'), footer: S('footer'),
      vat_rate: S('vat_rate') ? Number(S('vat_rate').replace(',', '.')) : 5.5,
      vat_rates: vatRates.length ? [...new Set(vatRates)] : [5.5, 20, 10, 2.1, 0]
    });
    throw redirect(303, withFlash('/admin/parametres', 'Informations de facturation enregistrées.', 'success'));
  },

  /** Tout synchroniser, dans l'ordre des dépendances ; arrêt à la première erreur. */
  syncTout: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const opts = {
      limit: Math.max(50, Math.min(5000, Number(fd.get('limit') ?? 1000) || 1000)),
      dryRun: fd.get('dryRun') === 'on',
      full: fd.get('full') === 'on'
    };
    const etapes: { key: string; label: string; result?: ImportResult; error?: string }[] = [];
    for (const e of ETAPES) {
      try {
        etapes.push({ key: e.key, label: e.label, result: await syncEtape(e.key, e.fn, { ...opts, limit: e.limit ?? opts.limit }) });
      } catch (err) {
        // Les étapes suivantes dépendent de celle-ci : inutile (voire nuisible) de continuer.
        etapes.push({ key: e.key, label: e.label, error: err instanceof Error ? err.message : 'Échec.' });
        break;
      }
    }
    return { syncTout: { dryRun: opts.dryRun, etapes } };
  }
};
