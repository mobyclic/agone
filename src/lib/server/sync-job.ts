/**
 * Synchronisation WordPress → Surreal, en TÂCHE DE FOND.
 *
 * Tout synchroniser peut prendre plusieurs minutes (milliers de commandes, lot
 * par lot). Exécutée dans la requête du formulaire, l'opération se faisait couper
 * par le proxy de l'hébergeur (« upstream error », réponse non-JSON côté client).
 * Désormais l'action lance la tâche et répond aussitôt ; la page interroge
 * /admin/api/sync pour suivre l'avancement.
 *
 * Une seule synchro à la fois, gardée en mémoire du processus : un redémarrage
 * l'interrompt, mais le curseur de chaque étape étant enregistré APRÈS CHAQUE LOT
 * (import réel), relancer reprend là où elle s'était arrêtée.
 */
import { getSetting, setSetting } from './site';
import {
  importUsers, importOrders, importAuthors, importArticles, importBooks, importEvents, importCoversEtCollections,
  importBibliotheques,
  type ImportResult, type ImportOpts
} from './migration';

/**
 * Ordre de synchronisation — il n'est PAS arbitraire : chaque étape s'appuie sur
 * ce que les précédentes ont posé.
 *   1. Auteurs      — aucune dépendance.
 *   2. Livres       — arêtes contributed_by → auteurs ; couverture et collection.
 *   2b. Couvertures & collections manquantes (rattrapage, sans curseur).
 *   3. Articles     — liés aux auteurs et aux livres.
 *   4. Rencontres   — auteurs, livres, lieux.
 *   5. Utilisateurs — comptes clients.
 *   6. Commandes    — rattachées aux comptes (5) et aux livres (2).
 *   7. Bibliothèques — droits d'accès aux ebooks, déduits des commandes payées.
 */
const ETAPES: { key: string; label: string; fn: (o: ImportOpts) => Promise<ImportResult>; limit?: number }[] = [
  { key: 'authors', label: 'Auteurs', fn: importAuthors },
  { key: 'books', label: 'Livres', fn: importBooks },
  // Rattrapage des couvertures / collections manquantes (livres déjà dépassés par le curseur).
  { key: 'covers', label: 'Couvertures & collections', fn: importCoversEtCollections, limit: 1000 },
  { key: 'articles', label: 'Articles', fn: importArticles },
  { key: 'events', label: 'Rencontres', fn: importEvents },
  // Comptes : WordPress ne date pas leurs modifications → balayage complet en un seul lot.
  { key: 'users', label: 'Utilisateurs', fn: importUsers, limit: 5000 },
  { key: 'orders', label: 'Commandes', fn: importOrders },
  // Bibliothèques : dépend des commandes (6) et des fichiers ebook.
  { key: 'library', label: 'Bibliothèques ebook', fn: importBibliotheques, limit: 5000 }
];

/** Au-delà, on s'arrête (garde-fou contre une boucle) ; relancer continue. */
const MAX_LOTS = 50;

export interface EtapeSynchro {
  key: string;
  label: string;
  statut: 'attente' | 'en_cours' | 'fait' | 'erreur' | 'annule';
  lots: number;
  result?: ImportResult;
  error?: string;
}

export interface JobSynchro {
  id: string;
  dryRun: boolean;
  enCours: boolean;
  debut: string;
  fin?: string;
  etapes: EtapeSynchro[];
}

let job: JobSynchro | null = null;

export const etatSynchro = (): JobSynchro | null => job;

/** Lance la synchro (ou renvoie celle qui tourne déjà). */
export function lancerSynchro(opts: { limit: number; dryRun: boolean; full: boolean }): JobSynchro {
  if (job?.enCours) return job;
  const j: JobSynchro = {
    id: Math.random().toString(36).slice(2, 10),
    dryRun: opts.dryRun,
    enCours: true,
    debut: new Date().toISOString(),
    etapes: ETAPES.map((e) => ({ key: e.key, label: e.label, statut: 'attente', lots: 0 }))
  };
  job = j;
  void executer(j, opts);
  return j;
}

async function executer(j: JobSynchro, opts: { limit: number; dryRun: boolean; full: boolean }) {
  try {
    for (let i = 0; i < ETAPES.length; i++) {
      const e = ETAPES[i];
      const et = j.etapes[i];
      et.statut = 'en_cours';
      try {
        et.result = await syncEtape(e, et, { ...opts, limit: e.limit ?? opts.limit });
        et.statut = 'fait';
      } catch (err) {
        et.statut = 'erreur';
        et.error = err instanceof Error ? err.message : 'Échec.';
        // Les étapes suivantes dépendent de celle-ci : inutile (voire nuisible) de continuer.
        for (const reste of j.etapes.slice(i + 1)) reste.statut = 'annule';
        break;
      }
    }
  } finally {
    j.enCours = false;
    j.fin = new Date().toISOString();
  }
}

/**
 * Une étape, par lots successifs jusqu'à épuisement. Chaque import lit les
 * enregistrements modifiés depuis le curseur, du plus ancien au plus récent :
 * un seul lot ne voyait que les PLUS ANCIENS (sans curseur, les 2000 premières
 * commandes revenaient à chaque fois). Le curseur avance donc de lot en lot —
 * en mémoire pour une simulation, enregistré après chaque lot pour un import réel.
 */
async function syncEtape(
  e: (typeof ETAPES)[number],
  et: EtapeSynchro,
  opts: { limit: number; dryRun: boolean; full: boolean }
): Promise<ImportResult> {
  const state = ((await getSetting('sync_state')) ?? {}) as Record<string, any>;
  const prev = state[e.key]?.watermark ? new Date(String(state[e.key].watermark)) : null;
  let curseur: Date | null = opts.full ? null : prev;
  const total: ImportResult = { type: e.key, fetched: 0, created: 0, updated: 0, skipped: 0, warnings: [], dryRun: opts.dryRun };
  et.result = total; // l'avancement se lit en direct

  for (let lot = 0; lot < MAX_LOTS; lot++) {
    const r = await e.fn({ limit: opts.limit, dryRun: opts.dryRun, since: curseur });
    et.lots = lot + 1;
    total.type = r.type;
    total.fetched += r.fetched; total.created += r.created; total.updated += r.updated; total.skipped += r.skipped;
    for (const w of r.warnings) if (total.warnings.length < 200) total.warnings.push(w);
    if (r.fullScan) total.fullScan = true;
    if (r.watermark) total.watermark = r.watermark;

    if (!opts.dryRun) await enregistrerCurseur(e.key, prev, total);

    // Fin : lot incomplet, source sans date (balayage complet), ou curseur figé
    // (plus de `limit` enregistrements modifiés dans la même seconde).
    const suivant = r.watermark ? new Date(r.watermark) : null;
    if (r.fetched < opts.limit || r.fullScan || !suivant || (curseur && suivant <= curseur)) break;
    curseur = suivant;
  }
  return total;
}

/** Réécrit le curseur de l'étape ; un lot vide le laisse intact, il ne recule jamais. */
async function enregistrerCurseur(key: string, prev: Date | null, total: ImportResult) {
  const state = ((await getSetting('sync_state')) ?? {}) as Record<string, any>;
  const next = total.watermark ?? state[key]?.watermark;
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
