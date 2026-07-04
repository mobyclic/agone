/** Libellés partagés (client + serveur) — pas d'import serveur ici. */

export const ROLE_ORDER = ['author', 'editor', 'translator', 'preface', 'postface', 'illustrator', 'other'] as const;

export const ROLE_LABEL: Record<string, string> = {
  author: 'Auteur',
  editor: 'Édition',
  translator: 'Traduction',
  preface: 'Préface',
  postface: 'Postface',
  illustrator: 'Illustration',
  other: 'Contribution'
};

/** Formate un prix en euros (fr). */
export function euros(n?: number | null): string | null {
  return n != null ? `${n.toFixed(2).replace('.', ',')} €` : null;
}
