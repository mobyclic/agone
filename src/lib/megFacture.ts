/**
 * Lecture d'une facture ou d'un avoir MEG (Mon Expert en Gestion), à partir du
 * texte de son PDF. Pure : aucune base, aucun réseau — ce qui permet de la
 * tester sur tout un dossier de PDF.
 *
 * Mise en page lue : en-tête société, éventuel texte d'objet, tableau
 * « Libellé Qté Unité PU HT [Rem.] Montant HT TVA » (une ligne peut s'étaler sur
 * plusieurs lignes de texte : titre+ISBN, auteur, puis les nombres), adresse de
 * livraison, détail de la TVA, règlement et échéance (ou « réglée le … par … »),
 * totaux, puis le cartouche « Facture / Avoir », N°, date, N° client, client.
 */
export interface LigneMeg {
  description: string; isbn?: string; code?: string; auteur?: string;
  qty: number; unite: string; pu_ht: number; remise_pct: number; montant_ht: number; tva: number;
}
export interface FactureMeg {
  type: 'facture' | 'avoir';
  ref: string; date: string; reference?: string; intro?: string;
  client: { numero?: string; nom: string; adresse: string[]; postcode?: string; ville?: string; pays?: string; tel?: string; email?: string; tva?: string };
  lignes: LigneMeg[]; livraison?: string;
  /** Mentions sous le tableau (provisions retenues, exonération…). */
  complement?: string;
  total_ht: number; port_ht?: number; total_ht_net: number; tva: number; total_ttc: number;
  tva_detail: { code: string; taux: number; base: number; montant: number }[];
  reglement?: { mode: string; echeance?: string; echeance_montant?: number; regle_le?: string; regle_par?: string; regle_montant?: number };
  avertissements: string[];
}

const nombre = (s: string) => Number(String(s).replace(/\s| /g, '').replace(',', '.'));
const dateIso = (fr: string) => { const m = fr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : fr; };
// Montants : milliers séparés par une espace, deux décimales — jusqu'à cinq sur un prix unitaire remisé.
const NOMBRE = '-?\\d[\\d\\s\\u00a0]*,\\d{2,5}';
// Fin d'une ligne du tableau : qté, unité, PU HT €, [remise %], montant HT €, TVA %.
const FIN_LIGNE = new RegExp(`^(.*?)\\s*(${NOMBRE})\\s+(\\S+)\\s+(${NOMBRE})\\s*€(?:\\s+(${NOMBRE})\\s*%)?\\s+(${NOMBRE})\\s*€\\s+(${NOMBRE})\\s*%\\s*$`);
const CODE = /(97[89]\d{10}|[A-Z]{3}\d{6,})/;
const PAYS = new Set(['FRANCE', 'BELGIQUE', 'SUISSE', 'CANADA', 'ALLEMAGNE', 'ITALIE', 'ESPAGNE', 'LUXEMBOURG', 'ROYAUME-UNI', 'PAYS-BAS', 'QUEBEC', 'PORTUGAL', 'MAROC', 'TUNISIE', 'ALGERIE']);

export function lireFactureMeg(texte: string): FactureMeg | null {
  const lignes = texte.split(/\r?\n/).map((l) => l.replace(/ /g, ' ').trim()).filter(Boolean);
  const iH = lignes.findIndex((l) => /^Libellé\s+Qté\s+Unité\s+PU HT/.test(l));
  const iDoc = lignes.findIndex((l, i) => /^(Facture|Avoir)$/.test(l) && /^N° : /.test(lignes[i + 1] ?? ''));
  if (iDoc < 0) return null;
  const av: string[] = [];

  // ── Cartouche et client ──
  const type = lignes[iDoc] === 'Avoir' ? 'avoir' : 'facture';
  const ref = lignes[iDoc + 1].replace(/^N° : /, '').trim();
  let date = '', reference: string | undefined, tvaClient: string | undefined, numero: string | undefined;
  let i = iDoc + 2;
  for (; i < lignes.length; i++) {
    const l = lignes[i];
    let m;
    if ((m = l.match(/^Date(?: d'émission)? : (\d{2}\/\d{2}\/\d{4})/))) date = dateIso(m[1]);
    else if ((m = l.match(/^En référence : (.+)$/))) reference = m[1].trim();
    else if ((m = l.match(/^N° TVA : (.+)$/))) tvaClient = m[1].trim() === 'NC' ? undefined : m[1].trim();
    else if ((m = l.match(/^N° client : (.+)$/))) numero = m[1].trim();
    else break;
  }
  // Le bloc client s'arrête là où le document reprend (seconde page) ou au tableau.
  const bloc: string[] = [];
  for (let k = i; k < lignes.length; k++) {
    if (/^(Facture|Avoir|Libellé\s+Qté|Page de)/.test(lignes[k])) break;
    bloc.push(lignes[k]);
  }
  const client: FactureMeg['client'] = { numero, nom: '', adresse: [], tva: tvaClient };
  for (const l of bloc) {
    let m;
    if ((m = l.match(/^(?:Port|Tél\.?|Téléphone|Tel)(?: \d)? ?: ?(.+)$/i))) { client.tel = m[1].trim(); continue; }
    if ((m = l.match(/^E-?mail ?: ?(\S+@\S+)$/i))) { client.email = m[1].trim(); continue; }
    if (!client.nom) { client.nom = l; continue; }
    if ((m = l.match(/^(\d{5})\s+(.+)$/)) && !client.postcode) { client.postcode = m[1]; client.ville = m[2].trim(); continue; }
    if (PAYS.has(l.toUpperCase()) && !client.pays) {
      client.pays = l;
      // Hors de France, la ligne précédente porte code et ville (« E1A3E9 NB MONCTON »).
      if (!client.postcode && client.adresse.length) { const d = client.adresse.pop()!; const mm = d.match(/^(\S+)\s+(.+)$/); if (mm) { client.postcode = mm[1]; client.ville = mm[2]; } else client.ville = d; }
      continue;
    }
    client.adresse.push(l);
  }
  if (!client.nom) av.push('client introuvable');

  // ── Tableau des lignes ──
  const fin = (l: string) => /^(Adresse de livraison|Type de vente|Détail de la TVA|Tout retard|En cas de retard|Pas d'escompte|Règlement|Total HT)/.test(l);
  const items: LigneMeg[] = [];
  const intro: string[] = [];
  const complement: string[] = [];
  if (iH >= 0) {
    // Ce qui précède le tableau (hors en-tête société et numéro de page) est l'objet.
    for (let k = 0; k < iH; k++) if (!/^(AGONE\s*-|-\s*Siret|Page de)/.test(lignes[k])) intro.push(lignes[k]);
    let acc: string[] = [];
    let saut = false; // seconde page : on saute le cartouche jusqu'au prochain en-tête de tableau
    for (let k = iH + 1; k < lignes.length && !fin(lignes[k]); k++) {
      const l = lignes[k];
      if (/^(Facture|Avoir)$/.test(l) && /^N° : /.test(lignes[k + 1] ?? '')) { saut = true; continue; }
      if (saut) { if (/^Libellé\s+Qté/.test(l)) saut = false; continue; }
      if (/^Page de\d+ \d+$/.test(l)) continue;
      const m = l.match(FIN_LIGNE);
      if (!m) { acc.push(l); continue; }
      if (m[1]) acc.push(m[1]);
      // Un texte sans code devant une ligne qui en porte un est un objet, pas un titre.
      while (acc.length > 1 && !CODE.test(acc[0]) && acc.slice(1).some((a) => CODE.test(a))) intro.push(acc.shift()!);
      const brut = acc.join(' ').replace(/\s+/g, ' ').trim();
      const code = brut.match(CODE)?.[1];
      let description = brut, auteur: string | undefined;
      if (code) {
        const [avant, apres] = brut.split(code);
        description = avant.trim();
        const reste = (apres ?? '').replace(/^\s*-\s*/, '').trim();
        if (reste && reste !== '-') auteur = reste.replace(/\s*-\s*$/, '').trim() || undefined;
      }
      items.push({
        description, isbn: code && /^97/.test(code) ? code : undefined, code: code && !/^97/.test(code) ? code : undefined, auteur,
        qty: nombre(m[2]), unite: m[3], pu_ht: nombre(m[4]), remise_pct: m[5] ? nombre(m[5]) : 0, montant_ht: nombre(m[6]), tva: nombre(m[7])
      });
      acc = [];
    }
    // Ce qui suit la dernière ligne (mentions, provisions…) est un complément, pas une ligne.
    if (acc.length) complement.push(...acc);
  } else av.push('tableau des lignes introuvable');

  // ── Totaux, TVA, règlement ──
  const t = lignes.join('\n');
  const montant = (etiquette: string) => { const m = t.match(new RegExp(`^${etiquette} (${NOMBRE}) €$`, 'm')); return m ? nombre(m[1]) : undefined; };
  const sommeLignes = Math.round(items.reduce((a, l) => a + l.montant_ht, 0) * 100) / 100;
  const total_ht = montant('Total HT') ?? sommeLignes, port_ht = montant('Frais de port HT'), total_ht_net = montant('Total HT net') ?? total_ht, total_ttc = montant('Total TTC');
  const tva = montant('TVA') ?? (total_ttc != null ? Math.round((total_ttc - total_ht_net) * 100) / 100 : 0);
  if (total_ttc == null) av.push('total TTC introuvable');
  const tva_detail: FactureMeg['tva_detail'] = [];
  for (const m of t.matchAll(new RegExp(`^(\\S+) (${NOMBRE}) € (\\d+,\\d{2})% (${NOMBRE}) €$`, 'gm'))) {
    if (['Total', 'Frais'].includes(m[1])) continue;
    tva_detail.push({ code: m[1], base: nombre(m[2]), taux: nombre(m[3]), montant: nombre(m[4]) });
  }
  let reglement: FactureMeg['reglement'];
  const mode = t.match(/^Règlement (.+)$/m)?.[1]?.trim();
  if (mode) {
    reglement = { mode };
    const ech = t.match(new RegExp(`Echéance\\(s\\)\\s+(${NOMBRE}) € au (\\d{2}/\\d{2}/\\d{4})`));
    if (ech) { reglement.echeance_montant = nombre(ech[1]); reglement.echeance = dateIso(ech[2]); }
    const reg = t.match(new RegExp(`réglée\\(s\\)\\s+(${NOMBRE}) € réglée le (\\d{2}/\\d{2}/\\d{4}) par (.+)$`, 'm'));
    if (reg) { reglement.regle_montant = nombre(reg[1]); reglement.regle_le = dateIso(reg[2]); reglement.regle_par = reg[3].trim(); }
  }
  const livraison = t.match(/^Adresse de livraison : (.+)$/m)?.[1]?.trim();

  return {
    type, ref, date, reference, intro: intro.join('\n') || undefined, client, lignes: items, livraison,
    complement: complement.join('\n') || undefined,
    total_ht: total_ht ?? 0, port_ht, total_ht_net: total_ht_net ?? 0, tva: tva ?? 0, total_ttc: total_ttc ?? 0,
    tva_detail, reglement, avertissements: av
  };
}

/** Mode de règlement MEG → le nôtre. */
export function modeReglement(mode?: string): string {
  const s = (mode ?? '').toLowerCase();
  if (/vir/.test(s)) return 'virement';
  if (/ch[èe]que/.test(s)) return 'cheque';
  if (/esp/.test(s)) return 'especes';
  if (/carte|cb|sumup/.test(s)) return 'sumup';
  return 'autre';
}
