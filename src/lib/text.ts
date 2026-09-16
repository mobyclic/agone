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

/**
 * Termine proprement un texte déjà tronqué (ou le tronque à `max`).
 *
 * L'import WordPress coupait les extraits à 220 caractères pile, donc en plein
 * mot : « …la bousculade et la rancune médiatique qui en découlent, m'en ». On
 * recule jusqu'à la dernière frontière de mot et on pose des points de suspension.
 * Un texte qui se termine déjà sur une ponctuation forte est laissé intact — il
 * s'agit alors d'un chapô rédigé, pas d'une troncature.
 */
export function extraitPropre(texte?: string | null, max?: number): string | undefined {
  const s = (texte ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return undefined;
  const coupe = max != null && s.length > max ? s.slice(0, max) : s;
  const tronque = coupe.length < s.length;
  if (!tronque && /[.!?…»)\]]$/.test(coupe)) return coupe;
  // Recule au dernier espace pour ne pas laisser un mot amputé.
  const espace = coupe.lastIndexOf(' ');
  const base = espace > coupe.length * 0.5 ? coupe.slice(0, espace) : coupe;
  return base.replace(/[\s,;:–—-]+$/, '') + '…';
}

/**
 * Retire les <script> d'un HTML éditorial hérité de WordPress.
 *
 * POURQUOI CE N'EST PAS COSMÉTIQUE : `{@html}` recopie ces balises dans un
 * template cloné, et un script cloné n'est PAS marqué « déjà démarré » — il
 * s'exécute donc pour de bon. Le code d'intégration Instagram collé dans une
 * présentation de livre chargeait ainsi `embed.js` (script Meta, dépôt de
 * cookies) en contournant notre bannière de consentement. Le chargement passe
 * désormais par $lib/client/embeds, qui attend l'accord « marketing ».
 * Accessoirement, cela ferme la porte à tout script arrivé par la base.
 */
export function sansScripts(html?: string | null): string | undefined {
  if (!html) return undefined;
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '').replace(/<script\b[^>]*\/?>/gi, '');
}
