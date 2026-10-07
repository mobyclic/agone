import { fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { lireFactureMeg, type FactureMeg } from '$lib/megFacture';
import { importerFactureMeg, type ResultatImport } from '$lib/server/importFacturesMeg';
import { saveMedia } from '$lib/server/media';
import { query } from '$lib/server/surreal';
import { journaliser } from '$lib/server/journal';

/**
 * Import des anciennes factures MEG, en deux temps : les PDF sont lus et
 * présentés (client, montants, règlement, déjà importé ou non) ; puis ceux qu'on
 * retient sont enregistrés, avec leur PDF. Entre les deux, les fichiers lus
 * attendent en mémoire sous un jeton, trente minutes.
 */
interface Lu { nom: string; chemin: string; fichier: File; facture: FactureMeg | null; erreur?: string; deja: boolean; annulee: boolean; devis: boolean }
const attente = new Map<string, { lus: Lu[]; expire: number }>();

async function texteDe(file: File): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals);
  const [n] = await query<any>(`SELECT count() AS n FROM invoice WHERE imported_from = 'meg' GROUP ALL`);
  return { dejaImportees: Number(n?.n ?? 0) };
};

export const actions: Actions = {
  /** Lecture des PDF déposés (un dossier entier, sous-dossiers compris). */
  lire: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const fichiers = fd.getAll('files').filter((f): f is File => f instanceof File && f.size > 0 && /\.pdf$/i.test(f.name));
    if (!fichiers.length) return fail(400, { error: 'Déposez des PDF de factures MEG (ou un dossier).' });
    const chemins = fd.getAll('paths').map(String);
    const refs = new Set((await query<any>(`SELECT ref FROM invoice WHERE imported_from = 'meg'`)).map((r: any) => String(r.ref)));
    const lus: Lu[] = [];
    for (let i = 0; i < fichiers.length; i++) {
      const fichier = fichiers[i];
      const chemin = chemins[i] || fichier.name;
      const devis = /^DEV\d+/i.test(fichier.name) || /devis/i.test(fichier.name);
      let facture: FactureMeg | null = null, erreur: string | undefined;
      if (!devis) {
        try { facture = lireFactureMeg(await texteDe(fichier)); if (!facture) erreur = 'ni facture ni avoir MEG reconnu'; }
        catch (e) { erreur = e instanceof Error ? e.message : 'lecture impossible'; }
      }
      // Dans un sous-dossier « ANNULE », la facture est annulée ; l'avoir qui l'annule, lui, reste valable.
      const annulee = /annul/i.test(chemin) && facture?.type === 'facture';
      lus.push({ nom: fichier.name, chemin, fichier, facture, erreur, deja: !!facture && refs.has(facture.ref), annulee, devis });
    }
    lus.sort((a, b) => (a.facture?.date ?? '').localeCompare(b.facture?.date ?? '') || a.nom.localeCompare(b.nom));
    const maintenant = Date.now();
    for (const [k, v] of attente) if (v.expire < maintenant) attente.delete(k);
    const token = Math.random().toString(36).slice(2, 12) + maintenant.toString(36);
    attente.set(token, { lus, expire: maintenant + 30 * 60_000 });
    return {
      token,
      apercu: lus.map((l, i) => ({
        i, nom: l.nom, chemin: l.chemin, devis: l.devis, annulee: l.annulee, deja: l.deja, erreur: l.erreur,
        facture: l.facture && {
          type: l.facture.type, ref: l.facture.ref, date: l.facture.date, client: l.facture.client.nom, numeroClient: l.facture.client.numero,
          lignes: l.facture.lignes.length, total_ttc: l.facture.total_ttc, regle: !!l.facture.reglement?.regle_le, mode: l.facture.reglement?.mode,
          echeance: l.facture.reglement?.echeance, avertissements: l.facture.avertissements
        }
      }))
    };
  },

  /** Enregistrement des factures retenues, avec leur PDF. */
  importer: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const lot = attente.get(String(fd.get('token') ?? ''));
    if (!lot || lot.expire < Date.now()) return fail(400, { error: 'Les fichiers lus ont expiré : redéposez-les.' });
    const retenus = new Set(fd.getAll('retenu').map(Number));
    const resultats: (ResultatImport & { nom: string })[] = [];
    const erreurs: string[] = [];
    for (const [i, l] of lot.lus.entries()) {
      if (!retenus.has(i) || !l.facture || l.deja || l.devis) continue;
      try {
        const media = await saveMedia({ file: l.fichier, folder: 'factures', kind: 'document' });
        const r = await importerFactureMeg(l.facture, { mediaId: String(media.id).replace(/^media:/, ''), annulee: l.annulee });
        resultats.push({ ...r, nom: l.nom });
      } catch (e) { erreurs.push(`${l.nom} : ${e instanceof Error ? e.message : 'échec'}`); }
    }
    attente.delete(String(fd.get('token')));
    const crees = resultats.filter((r) => r.statut === 'cree');
    await journaliser(locals, { action: 'factures.importees', cible: { type: 'invoice', id: crees[0]?.id ?? 'meg', libelle: `${crees.length} factures MEG importées` }, details: { factures: crees.length, clients_crees: crees.filter((r) => r.client === 'cree').length, erreurs: erreurs.length } });
    return { resultats, erreurs };
  }
};
