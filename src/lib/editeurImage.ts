import Image from '@tiptap/extension-image';

/** Alignements proposés pour une image de l'éditeur. */
export const ALIGNEMENTS_IMAGE = [
  { v: 'none', label: 'Normal', titre: 'Image seule, sur sa ligne' },
  { v: 'left', label: 'Gauche', titre: 'Flottante à gauche, le texte l’entoure' },
  { v: 'center', label: 'Centrée', titre: 'Centrée sur sa ligne' },
  { v: 'right', label: 'Droite', titre: 'Flottante à droite, le texte l’entoure' }
] as const;
export type AlignementImage = (typeof ALIGNEMENTS_IMAGE)[number]['v'];

/** Tailles proposées (en % de la largeur du texte) ; vide = taille naturelle. */
export const TAILLES_IMAGE = [25, 33, 50, 66, 75, 100] as const;

/**
 * Image de l'éditeur : l'extension TipTap de base (src, alt, title, width/height
 * en pixels hérités de WordPress) enrichie de trois réglages portés par des
 * `data-*` dans le HTML stocké, interprétés par le CSS (`app.css`) sur le site
 * comme dans l'éditeur, et inlinés pour la newsletter :
 * - `data-align`  : none | left | center | right (les classes WordPress
 *   `alignleft` / `aligncenter` / `alignright` sont reconnues à la lecture) ;
 * - `data-taille` : largeur en % du texte (doublée d'un `style="width:…%"`) ;
 * - `data-border` : « 1 » pour un filet fin autour de l'image.
 */
export const ImageAgone = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: 'none',
        parseHTML: (el) => {
          const d = el.getAttribute('data-align');
          if (d) return d;
          const cls = el.getAttribute('class') ?? '';
          if (/\balignleft\b/.test(cls)) return 'left';
          if (/\balignright\b/.test(cls)) return 'right';
          if (/\baligncenter\b/.test(cls)) return 'center';
          return 'none';
        },
        renderHTML: (attrs) => (attrs.align && attrs.align !== 'none' ? { 'data-align': attrs.align } : {})
      },
      taille: {
        default: null,
        parseHTML: (el) => {
          const d = el.getAttribute('data-taille');
          if (d) return Number(d) || null;
          const m = (el.getAttribute('style') ?? '').match(/width:\s*(\d+)%/);
          return m ? Number(m[1]) : null;
        },
        renderHTML: (attrs) => (attrs.taille ? { 'data-taille': String(attrs.taille), style: `width:${attrs.taille}%` } : {})
      },
      border: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-border') === '1',
        renderHTML: (attrs) => (attrs.border ? { 'data-border': '1' } : {})
      }
    };
  }
});
