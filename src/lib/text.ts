/**
 * Recherche insensible aux accents ET à la casse.
 * - `deburr` : minuscule + suppression des diacritiques (filtrage côté JS, ex.
 *   page auteurs, ou construction du motif ci-dessous).
 * - `accentRegex` : bâtit un motif regex tolérant aux accents à passer à
 *   `string::matches(champ, $re)` côté SurrealDB (un seul appel de fonction,
 *   pas de récursion — contrairement à une cascade de string::replace).
 * Fichier client-safe (aucune dépendance serveur) : réutilisable côté navigateur.
 */

/** Minuscule + suppression des diacritiques (pour la valeur recherchée). */
export function deburr(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss');
}

// Chaque lettre ASCII → classe regex de ses variantes accentuées. Le motif est
// préfixé par (?i) : la casse et les majuscules accentuées (É, È…) sont donc
// couvertes par le moteur regex (Rust) côté SurrealDB.
const CLASS: Record<string, string> = {
  a: '[aàâäãå]', c: '[cç]', e: '[eéèêë]', i: '[iîïìí]', n: '[nñ]',
  o: '[oôöòóõ]', u: '[uûüùú]', y: '[yÿý]'
};

/**
 * Motif regex insensible aux accents pour `string::matches(champ, $re)`.
 * « societe » comme « société » retombent sur le même motif tolérant.
 * Renvoie '' si la valeur nettoyée est vide (à garder hors requête dans ce cas).
 */
export function accentRegex(qRaw: string): string {
  const q = deburr((qRaw ?? '').trim());
  if (!q) return '';
  // Les ligatures oe/ae acceptent aussi œ/æ ; sinon expansion caractère par caractère.
  const out = q.replace(/oe|ae|[\s\S]/g, (tok) => {
    if (tok === 'oe') return '(?:oe|œ)';
    if (tok === 'ae') return '(?:ae|æ)';
    if (CLASS[tok]) return CLASS[tok];
    if (/[a-z0-9]/.test(tok)) return tok;
    return '\\' + tok; // échappe ponctuation/espaces
  });
  return `(?i)${out}`;
}
