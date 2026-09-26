/**
 * Lecture automatique d'un contrat déposé (PDF).
 *
 * Reconnaît les deux gabarits maison — contrat d'édition et contrat de
 * traduction — ainsi que les « memorandum of agreement » de cession de droits,
 * en français comme en anglais. Le résultat est une PROPOSITION : elle est
 * présentée à l'opérateur, qui corrige et valide. Rien n'est enregistré sans son
 * accord, parce qu'un barème mal lu se paierait en euros.
 *
 * Un PDF scanné n'a pas de couche texte : on le dit plutôt que de deviner.
 */
import { texteDuPdf } from './pdftexte';
import { query } from './surreal';

export interface Palier { up_to?: number; rate: number }

export interface AnalyseContrat {
  lisible: boolean;
  genre: 'edition' | 'traduction' | 'cession' | 'inconnu';
  /** Ce qui a été reconnu, dans la langue du contrat. */
  titre?: string;
  personnes: { nom: string; role: string }[];
  paliers: Palier[];
  taux_numerique?: number;
  avaloir?: number;
  devise?: string;
  exemplaires_auteur?: number;
  seuil?: number;
  signe_le?: string;
  /** Cession : contrepartie, langue, durée. */
  contrepartie?: string;
  langue?: string;
  duree_ans?: number;
  sens?: 'out' | 'in';
  /** Rapprochements proposés dans le catalogue. */
  livres: { id: string; title: string }[];
  auteurs: { id: string; full_name: string; role: string }[];
  /** Ce que l'analyse n'a pas su lire — à saisir à la main. */
  reserves: string[];
  extrait: string;
}

const MILLE: Record<string, number> = {
  un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
  onze: 11, douze: 12, quinze: 15, vingt: 20, trente: 30, cinquante: 50, cent: 100
};

/** « deux premiers mille » → 2000 ; « 5 000 exemplaires » → 5000. */
function seuilFr(texte: string): number | undefined {
  const chiffre = texte.match(/(\d[\d   ]*)\s*(?:exemplaires)?/);
  if (chiffre && /\d/.test(chiffre[1])) {
    const n = Number(chiffre[1].replace(/[^\d]/g, ''));
    if (n >= 100) return n;
  }
  const mot = texte.match(/\b(un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|quinze|vingt|trente|cinquante|cent)\b[^.;]{0,20}mille/i);
  if (mot) return (MILLE[mot[1].toLowerCase()] ?? 1) * 1000;
  if (/\bmille\b/i.test(texte)) return 1000;
  return undefined;
}

/** Barème progressif du gabarit maison : « 6 % sur les deux premiers mille ; 8 % jusqu'à cinq mille… ». */
function paliersFr(t: string): Palier[] {
  const zone = t.match(/(\d{1,2})\s*%\s*sur\s+les\s+deux\s+premiers\s+mille[\s\S]{0,320}?exemplaires\s+suivants/i);
  if (!zone) return [];
  const paliers: Palier[] = [];
  for (const m of zone[0].matchAll(/(\d{1,2}(?:[.,]\d)?)\s*%([^%;]*)/g)) {
    const rate = Number(m[1].replace(',', '.'));
    const suite = m[2] ?? '';
    if (/suivants/i.test(suite)) paliers.push({ rate });
    else paliers.push({ rate, up_to: seuilFr(suite) });
  }
  // Un palier intermédiaire sans plafond lisible ne vaut rien : on le signale ailleurs.
  return paliers.filter((p, i) => p.up_to !== undefined || i === paliers.length - 1);
}

const nombreAnglais = (t: string): number | undefined => {
  const m = t.match(/\(?(?:€|EUR\s*)?([\d][\d.,\s]*)\)?/);
  if (!m) return undefined;
  // « 1,000 » (anglais) et « 1.500,00 » (italien) désignent des milliers.
  const brut = m[1].replace(/\s/g, '');
  const n = Number(brut.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

export async function analyserContrat(fichier: Buffer, nomFichier = ''): Promise<AnalyseContrat> {
  const brut = texteDuPdf(fichier);
  const t = brut.replace(/\s+/g, ' ').trim();
  const reserves: string[] = [];

  // Un scan ne donne que du bruit : on le reconnaît à la rareté des mots.
  const mots = t.match(/\b[A-Za-zÀ-ÿ]{3,}\b/g) ?? [];
  const lisible = t.length > 400 && mots.length > 80 &&
    /(contrat|agreement|éditeur|editeur|publisher)/i.test(t);
  if (!lisible) {
    return {
      lisible: false, genre: 'inconnu', personnes: [], paliers: [], livres: [], auteurs: [],
      reserves: ['Ce PDF n’a pas de couche texte : c’est une image (contrat scanné). Les valeurs sont à saisir à la main.'],
      extrait: ''
    };
  }

  const anglais = /MEMORANDUM OF AGREEMENT/i.test(t);
  const traduction = /contrat de traduction/i.test(t);
  const genre: AnalyseContrat['genre'] = anglais ? 'cession' : traduction ? 'traduction' : /contrat d[’']édition/i.test(t) ? 'edition' : 'inconnu';

  const a: AnalyseContrat = {
    lisible: true, genre, personnes: [], paliers: [], livres: [], auteurs: [], reserves,
    extrait: t.slice(0, 600)
  };

  if (anglais) {
    // ── Cession de droits ────────────────────────────────────────────────
    a.sens = /EDITIONS AGONE[\s\S]{0,200}?PROPRIETORS/i.test(t) ? 'out' : 'in';
    a.contrepartie = (a.sens === 'out'
      ? t.match(/AND\s+([A-Z][^,]{3,60}?)\s+(?:VAT|of|represented)/i)?.[1]
      : t.match(/Between\s+([A-Z][^,]{3,60}?)\s+of\s/i)?.[1]
    )?.trim();
    const LANGUES: Record<string, string> = {
      spanish: 'espagnol', english: 'anglais', italian: 'italien', german: 'allemand',
      portuguese: 'portugais', dutch: 'néerlandais', greek: 'grec', french: 'français',
      turkish: 'turc', japanese: 'japonais', korean: 'coréen', chinese: 'chinois', arabic: 'arabe'
    };
    const langue = t.match(/in the ([A-Za-z]+) language/i)?.[1]?.toLowerCase();
    a.langue = langue ? (LANGUES[langue] ?? langue) : undefined;
    a.titre = t.match(/entitled\s+[«"']?([^,(]{3,90}?)[»"']?\s*\(hereinafter/i)?.[1]?.trim();
    a.duree_ans = Number(t.match(/period of\s*\(?([a-z]+)\)?\s*(\d+)?\s*\(?(\d+)?\)?\s*years/i)?.[2] ??
      t.match(/(\d+)\s*\(\w+\)\s*years/i)?.[1] ?? t.match(/period of\s*(\d+)\s*\(/i)?.[1] ?? NaN) || undefined;
    const avance = t.match(/advance[^.]{0,80}?((?:€|euros?)\s*[\d][\d.,\s]*|[\d][\d.,\s]*\s*euros?)/i)?.[1]
      ?? t.match(/sum of euros?\s*([\d][\d.,\s]*)/i)?.[1];
    a.avaloir = avance ? nombreAnglais(avance) : undefined;
    a.devise = 'EUR';
    const papier = t.match(/([A-Za-z-]+)\s*per cent\s*\((\d{1,2})%\)[^.]{0,120}(printed|list price|retail)/i)
      ?? t.match(/(\d{1,2})%\s*royalty based on the list price/i);
    if (papier) a.paliers = [{ rate: Number(papier[2] ?? papier[1]) }];
    const num = t.match(/per cent\s*\((\d{1,2})%\)[^.]{0,120}(?:ebook|digital|net receipts)/i);
    if (num) a.taux_numerique = Number(num[1]);
    a.signe_le = t.match(/made this (\d{1,2})(?:st|nd|rd|th)? day of ([A-Za-z]+),? (\d{4})/i)?.[0];
    if (!a.contrepartie) reserves.push('Contrepartie non reconnue.');
    if (!a.avaloir) reserves.push('À-valoir non reconnu.');
  } else {
    // ── Contrats maison (édition, traduction) ────────────────────────────
    a.titre = t.match(/intitulé\s*:?\s*([^]{3,110}?)\s*ci-après dénommé/i)?.[1]?.trim()
      ?? t.match(/ayant pour titre\s+([^]{3,90}?)\s+dont/i)?.[1]?.trim();
    // Parties : ce qui suit « Entre les soussignés », jusqu'à l'adresse.
    const zone = t.match(/Entre les soussignés\s*:?\s*([\s\S]{0,400}?)(?:Éditions Agone|Editions Agone)/i)?.[1] ?? '';
    for (const m of zone.matchAll(/([A-ZÉÈÀÂÎÔÛÇ][\p{L}'’-]+(?:\s+[A-ZÉÈÀÂÎÔÛÇ][\p{L}'’-]+){1,3})\s*,?\s*\d/gu)) {
      // « EtNico Hirtt » : le « Et » qui relie deux coauteurs colle au prénom.
      const nom = m[1].replace(/^Et(?=[A-ZÉÈÀ])/, '').trim();
      // Une voie prise pour un nom : « 18, rue Château Payan ».
      const avant = zone.slice(Math.max(0, m.index! - 24), m.index!);
      if (/\b(rue|bd|boulevard|avenue|av|place|chemin|impasse|allée|quai)\b\.?\s*$/i.test(avant)) continue;
      if (/Agone|Marseille|Paris|Rue|Avenue/i.test(nom)) continue;
      if (!a.personnes.some((p) => p.nom === nom)) a.personnes.push({ nom, role: traduction ? 'translator' : 'author' });
    }
    a.paliers = paliersFr(t);
    const num = t.match(/(\d{1,2})\s*%\s*du prix de vente hors taxes? payé par le public/i);
    if (num) a.taux_numerique = Number(num[1]);
    if (traduction) {
      const tr = t.match(/(\d{1,2})\s*%\s*jusqu[’']à l[’']amortissement/i);
      if (tr) {
        a.paliers = [{ rate: Number(tr[1]) }];
        const apres = t.match(/(\d{1,2})\s*%\s*après l[’']amortissement/i);
        if (apres) reserves.push(`Le taux passe à ${apres[1]} % après amortissement de l’à-valoir : ce changement n’est pas encore automatisé.`);
      }
      const feuillet = t.match(/(\d[\d,.\s]*)\s*€\s*le feuillet/i);
      if (feuillet) reserves.push(`À-valoir calculé à ${feuillet[1].trim()} € le feuillet de 1 500 signes : montant total à saisir.`);
    }
    const av = t.match(/à-valoir[^.]{0,120}?(\d[\d   ]{2,})\s*(?:€|euros)/i);
    if (av) a.avaloir = Number(av[1].replace(/[^\d]/g, ''));
    const ex = t.match(/remis gratuitement[^.]{0,90}?au nombre de\s*(\d+)/i);
    if (ex) a.exemplaires_auteur = Number(ex[1]);
    const seuil = t.match(/inférieur à\s*\w*\s*\((\d+)\)\s*euros/i);
    if (seuil) a.seuil = Number(seuil[1]);
    if (!a.paliers.length) reserves.push('Barème non reconnu : à saisir à la main.');
    if (!a.personnes.length) reserves.push('Contributeur non reconnu.');
  }

  // ── Rapprochement avec le catalogue ─────────────────────────────────────
  // Le titre du contrat est souvent provisoire (« Roman noir et critique
  // sociale » pour « Roman noir et luttes sociales ») : on classe les
  // candidats par nombre de mots communs plutôt que de prendre le premier.
  const normalise = (v: string) =>
    v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ');
  const motsTitre = normalise(a.titre ?? nomFichier.replace(/[_-]+/g, ' '))
    .split(/\s+/).filter((m) => m.length > 3);
  // Comparaison sans accents : « école » ne se trouve pas en cherchant « ecole »
  // côté base. Le catalogue tient en une requête, on le rapproche ici.
  const catalogue = await query<any>(`SELECT meta::id(id) AS id, title FROM book`);
  const score = (titre: string) => {
    const mots = new Set(normalise(titre).split(/\s+/).filter((m) => m.length > 3));
    let n = 0;
    for (const m of motsTitre) if (mots.has(m)) n++;
    // Un titre court qui partage tous ses mots vaut mieux qu'un long qui en partage un.
    return n + (mots.size ? n / mots.size : 0);
  };
  a.livres = catalogue
    .map((b: any) => ({ id: b.id, title: b.title, s: score(b.title) }))
    .filter((b) => b.s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, 5)
    .map(({ id, title }) => ({ id, title }));
  for (const p of a.personnes) {
    const nom = p.nom.split(/\s+/).pop()!.toLowerCase();
    const r = await query<any>(
      `SELECT meta::id(id) AS id, full_name FROM author WHERE string::lowercase(full_name) CONTAINS $n LIMIT 3`, { n: nom });
    for (const au of r) if (!a.auteurs.some((x) => x.id === au.id)) a.auteurs.push({ ...au, role: p.role });
  }
  if (!a.livres.length) reserves.push('Aucun livre du catalogue ne correspond au titre : à choisir à la main.');
  return a;
}
