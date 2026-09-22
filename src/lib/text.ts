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

/**
 * Notes de bas de page : l'éditeur (RichEditor) stocke chaque appel de note EN
 * PLACE, texte compris — `<sup data-fn="texte de la note"></sup>` — pour que
 * déplacer ou supprimer un paragraphe emporte sa note sans renumérotation à la
 * main. Au rendu, chaque appel devient un exposant numéroté pointant vers la
 * liste finale, et chaque note renvoie à son appel (ancres aller-retour).
 */
export function notesDeBasDePage(html?: string | null): string | undefined {
  if (!html || !html.includes('data-fn=')) return html ?? undefined;
  const notes: string[] = [];
  const decode = (s: string) =>
    s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const echappe = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const liens = (s: string) =>
    s.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?»)\]]/g, (u) => `<a href="${u.replace(/"/g, '&quot;')}" rel="noopener">${u}</a>`);
  const corps = html.replace(/<sup\b[^>]*\bdata-fn="([^"]*)"[^>]*>[\s\S]*?<\/sup>/gi, (_m, brut: string) => {
    notes.push(liens(echappe(decode(brut).trim())));
    const n = notes.length;
    return `<sup class="appel-note" id="appel-${n}"><a href="#note-${n}" aria-describedby="titre-notes">${n}</a></sup>`;
  });
  if (!notes.length) return html;
  const liste = notes
    .map((t, i) => `<li id="note-${i + 1}">${t} <a href="#appel-${i + 1}" class="retour-note" aria-label="Revenir à l’appel de note ${i + 1}">↩</a></li>`)
    .join('');
  return `${corps}<section class="notes-bas-de-page"><h2 id="titre-notes" class="sr-only">Notes</h2><ol>${liste}</ol></section>`;
}
