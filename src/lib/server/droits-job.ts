/**
 * Relevé d'un exercice, en TÂCHE DE FOND.
 *
 * Arrêter les comptes d'une année demande quatre collectes distinctes (ventes du
 * distributeur, ventes directes du site, mouvements de stock, part des ventes
 * hors France). Les enchaîner dans la requête du formulaire prend plusieurs
 * minutes et se fait couper par le proxy de l'hébergeur : l'action lance donc la
 * tâche et répond aussitôt, la page suit l'avancement sur /admin/droits/api/collecte.
 *
 * Une seule collecte à la fois, gardée en mémoire du processus. Tout est
 * idempotent : relancer la même période refait les relevés automatiques au lieu
 * de les dupliquer.
 */
import {
  importVentesBldd, genererRelevesDepuisCommandes, importMouvementsBldd, detaillerExportBldd
} from './droits';
import { sumupConfigure, genererRelevesSumup } from './sumup';

export interface EtapeCollecte {
  key: string;
  label: string;
  statut: 'attente' | 'en_cours' | 'fait' | 'erreur' | 'ignore';
  detail?: string;
  remarque?: string;
  error?: string;
}

export interface JobCollecte {
  id: string;
  debut: string;
  fin?: string;
  enCours: boolean;
  periode: { start: string; end: string };
  avecExport: boolean;
  etapes: EtapeCollecte[];
}

let job: JobCollecte | null = null;

export const etatCollecte = (): JobCollecte | null => job;

export function lancerCollecte(opts: { start: Date; end: Date; avecExport: boolean }): JobCollecte {
  if (job?.enCours) return job;
  const j: JobCollecte = {
    id: Math.random().toString(36).slice(2, 10),
    debut: new Date().toISOString(),
    enCours: true,
    periode: { start: opts.start.toISOString(), end: opts.end.toISOString() },
    avecExport: opts.avecExport,
    etapes: [
      { key: 'bldd', label: 'Ventes en librairie (Belles Lettres)', statut: 'attente' },
      { key: 'directs', label: 'Ventes directes (site, comptoir, VPC)', statut: 'attente' },
      { key: 'sumup', label: 'Encaissements SumUp rapprochés', statut: sumupConfigure() ? 'attente' : 'ignore' },
      { key: 'mouvements', label: 'Mouvements de stock', statut: 'attente' },
      { key: 'export', label: 'Part des ventes hors France', statut: opts.avecExport ? 'attente' : 'ignore' }
    ]
  };
  job = j;
  void executer(j, opts);
  return j;
}

const nb = (n: number) => n.toLocaleString('fr-FR');

async function executer(j: JobCollecte, opts: { start: Date; end: Date; avecExport: boolean }) {
  const etape = (k: string) => j.etapes.find((e) => e.key === k)!;
  /** Une étape ratée n'arrête pas les autres : elles lisent des sources différentes. */
  const lancer = async (k: string, fn: () => Promise<{ detail: string; remarque?: string }>) => {
    const e = etape(k);
    e.statut = 'en_cours';
    try {
      const r = await fn();
      e.detail = r.detail;
      e.remarque = r.remarque;
      e.statut = 'fait';
      return true;
    } catch (err) {
      e.statut = 'erreur';
      e.error = err instanceof Error ? err.message : 'Échec.';
      return false;
    }
  };

  let reportsBldd: string[] = [];
  try {
    await lancer('bldd', async () => {
      const r = await importVentesBldd(opts.start, opts.end);
      reportsBldd = r.reportIds;
      return {
        detail: `${r.mois} mois · ${nb(r.lignes)} lignes · ${nb(r.vendus)} vendus · ${nb(r.retours)} retours · ${nb(r.prix_public_ht)} € prix public HT (facturé ${nb(r.facture_ht)} €)`,
        remarque: r.inconnus.length ? `${r.inconnus.length} ISBN absents du catalogue, ignorés` : undefined
      };
    });

    await lancer('directs', async () => {
      const res = await genererRelevesDepuisCommandes(opts.start, opts.end);
      const utiles = res.filter((r) => r.lignes > 0);
      return {
        detail: utiles.length ? utiles.map((r) => `${r.canal} : ${nb(r.unites)} ex.`).join(' · ') : 'aucune vente directe sur la période',
        remarque: 'papier et numérique du site compris : ces ventes ne figurent pas sur l’extranet des Belles Lettres'
      };
    });

    if (sumupConfigure()) {
      await lancer('sumup', async () => {
        const r = await genererRelevesSumup(opts.start, opts.end);
        return {
          detail: r.lignes ? `${nb(r.encaissements)} encaissements · ${nb(r.unites)} ex. sur ${nb(r.lignes)} titres` : 'aucun encaissement rapproché sur la période',
          remarque: r.aTraiter ? `${nb(r.aTraiter)} encaissement(s) encore à rapprocher, non comptés` : undefined
        };
      });
    }

    await lancer('mouvements', async () => {
      const r = await importMouvementsBldd(opts.start, opts.end);
      return {
        detail: `${nb(r.titres)} titres suivis sur ${r.mois} mois`,
        remarque: r.inconnus ? `${r.inconnus} ISBN absents du catalogue` : undefined
      };
    });

    if (opts.avecExport) {
      if (!reportsBldd.length) {
        const e = etape('export');
        e.statut = 'erreur';
        e.error = 'Sans relevé Belles Lettres, la part export ne peut pas être établie.';
      } else {
        await lancer('export', async () => {
          const r = await detaillerExportBldd(reportsBldd);
          return {
            detail: `${nb(r.unitesExport)} ex. hors France sur ${nb(r.avecExport)} titres (${nb(r.traites)} examinés)`,
            remarque: r.sansCode ? `${r.sansCode} titres sans code distributeur` : undefined
          };
        });
      }
    }
  } finally {
    j.enCours = false;
    j.fin = new Date().toISOString();
  }
}
