/**
 * Reconstruit les paragraphes d'un contenu WordPress brut.
 *
 * WordPress stocke le contenu SANS balises `<p>` et les ajoute au rendu via
 * `wpautop()` (paragraphes = doubles sauts de ligne). À l'import on récupère le
 * contenu brut : cette fonction refait le travail de wpautop pour un HTML propre.
 *
 * Sans dépendance (importable depuis un script standalone comme depuis l'app).
 */
const BLOCKS =
  'address|article|aside|blockquote|details|div|dl|dd|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hgroup|hr|main|menu|nav|ol|p|pre|section|table|thead|tbody|tfoot|tr|td|th|ul|li|iframe';

/** true si le HTML est déjà « paragraphé » (contient des balises `<p>`). */
export function hasParagraphs(html: string | undefined | null): boolean {
  return !!html && /<p[\s>]/i.test(html);
}

export function wpautop(input: string | undefined | null): string {
  if (!input) return '';
  // Déjà formaté (édité au WYSIWYG p.ex.) → ne pas retoucher.
  if (hasParagraphs(input)) return input;

  let t = input.replace(/\r\n?/g, '\n').trim();
  if (!t) return '';

  // Isole les balises de bloc pour qu'elles deviennent leurs propres morceaux.
  t = t.replace(new RegExp(`\\s*(</?(?:${BLOCKS})(?:\\s[^>]*)?>)\\s*`, 'gi'), '\n\n$1\n\n');
  t = t.replace(/\n{3,}/g, '\n\n');

  const blockStart = new RegExp(`^</?(?:${BLOCKS})(?:[\\s/>]|$)`, 'i');
  const parts = t.split(/\n\n+/);
  const out = parts
    .map((p) => {
      const s = p.trim();
      if (!s) return '';
      if (blockStart.test(s)) return s; // déjà un bloc → laisser tel quel
      return `<p>${s.replace(/\n/g, '<br>')}</p>`; // texte libre → paragraphe
    })
    .filter(Boolean);
  return out.join('\n');
}
