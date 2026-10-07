/**
 * Rapprochement d'un libellé MEG avec un titre du catalogue, quand l'ISBN manque.
 * MEG coupe les libellés longs (« PRENDRE LA PAR ») et rejette l'article en fin
 * (« MATRICE DES CLASSES SOCIALES (LA) ») : on compare des formes normalisées,
 * article devant ou absent, et on n'accepte qu'un début de titre assez long
 * et qui ne désigne qu'un seul livre.
 */
const ARTICLES = ['LE', 'LA', 'LES', "L'", 'L', 'UN', 'UNE', 'DES', 'DU', 'DE'];

/** Majuscules sans accents ni ponctuation, espaces repliées. */
export const normaliser = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

/** Formes comparables d'un titre du catalogue : tel quel, et sans son article initial. */
export function formesTitre(titre: string): string[] {
  const n = normaliser(titre);
  const out = [n];
  const m = n.match(/^(LE|LA|LES|L|UN|UNE|DES|DU|DE) (.+)$/);
  if (m) out.push(m[2]);
  return out;
}

/** Forme comparable d'un libellé MEG : l'article rejeté en fin revient devant, ou disparaît. */
export function formesLibelleMeg(libelle: string): string[] {
  const brut = libelle.trim();
  const m = brut.match(/^(.*?)\s*\((L'|LE|LA|LES|UN|UNE|DES)\)\s*$/i);
  if (m) { const corps = normaliser(m[1]); const art = normaliser(m[2]); return [`${art} ${corps}`.trim(), corps]; }
  const n = normaliser(brut);
  const m2 = n.match(/^(LE|LA|LES|L|UN|UNE|DES|DU|DE) (.+)$/);
  return m2 ? [n, m2[2]] : [n];
}

export interface TitreCatalogue { id: string; title: string }

/**
 * Le livre dont le titre commence par le libellé (ou dont le libellé commence par
 * le titre, pour un titre court), s'il est seul à convenir. Null sinon.
 */
export function rapprocherTitre(libelle: string, catalogue: TitreCatalogue[], minimum = 8): TitreCatalogue | null {
  const formes = formesLibelleMeg(libelle).filter((f) => f.length >= minimum);
  if (!formes.length) return null;
  const trouves = new Map<string, TitreCatalogue>();
  for (const b of catalogue) {
    const ft = formesTitre(b.title);
    if (formes.some((f) => ft.some((t) => t === f || t.startsWith(f) || (f.startsWith(t) && t.length >= 12)))) trouves.set(b.id, b);
  }
  return trouves.size === 1 ? [...trouves.values()][0] : null;
}
