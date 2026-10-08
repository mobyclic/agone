import { Node, mergeAttributes } from '@tiptap/core';
import { RESEAUX, detecterReseau, nettoyerUrl, type Reseau } from '$lib/reseauxSociaux';

/**
 * Publication de réseau social dans l'éditeur : nœud bloc atomique
 * `<figure class="reseau-social" data-reseau data-url>`, affiché comme une
 * carte (réseau + adresse) ; c'est le site qui monte le vrai lecteur.
 *
 * À la lecture, les intégrations héritées de WordPress sont reconnues et
 * converties : blockquote Instagram (y compris ceux dont l'éditeur avait perdu
 * les attributs), blockquote X / TikTok, iframes YouTube / Vimeo / Facebook.
 */
export const ReseauSocial = Node.create({
  name: 'reseauSocial',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      reseau: { default: null },
      url: { default: '' }
    };
  },

  parseHTML() {
    const depuisUrl = (url: string | null | undefined) => {
      const reseau = url ? detecterReseau(url) : null;
      return reseau ? { reseau, url: nettoyerUrl(url!, reseau) } : false;
    };
    return [
      {
        tag: 'figure.reseau-social[data-url]',
        getAttrs: (el) => ({ reseau: el.getAttribute('data-reseau'), url: el.getAttribute('data-url') ?? '' })
      },
      { tag: 'blockquote.instagram-media', priority: 100, getAttrs: (el) => depuisUrl(el.getAttribute('data-instgrm-permalink')) },
      { tag: 'blockquote.twitter-tweet', priority: 100, getAttrs: (el) => depuisUrl(Array.from(el.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '').find((h) => /\/status\/\d+/.test(h))) },
      { tag: 'blockquote.tiktok-embed', priority: 100, getAttrs: (el) => depuisUrl(el.getAttribute('cite')) },
      {
        // Intégration Instagram dont une sauvegarde antérieure a perdu la classe et les data-* :
        // il ne reste que le texte « Voir cette publication sur Instagram » et le lien.
        tag: 'blockquote',
        priority: 100,
        getAttrs: (el) => {
          if (!/Voir cette publication sur Instagram/i.test(el.textContent ?? '')) return false;
          const a = el.querySelector('a[href*="instagram.com/"]');
          return depuisUrl(a?.getAttribute('href'));
        }
      },
      {
        tag: 'iframe[src]',
        priority: 100,
        getAttrs: (el) => {
          const src = el.getAttribute('src') ?? '';
          const fb = src.match(/facebook\.com\/plugins\/(?:post|video)\.php\?.*?href=([^&]+)/);
          return depuisUrl(fb ? decodeURIComponent(fb[1]) : src);
        }
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { reseau, url, ...reste } = HTMLAttributes;
    return ['figure', mergeAttributes(reste, { class: 'reseau-social', 'data-reseau': reseau ?? undefined, 'data-url': url ?? '' })];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('figure');
      dom.className = 'reseau-social';
      dom.contentEditable = 'false';
      const r = node.attrs.reseau as Reseau | null;
      dom.innerHTML =
        `<span class="reseau-social__label">${r ? RESEAUX[r].label : 'Réseau social'}</span>` +
        `<span class="reseau-social__url">${String(node.attrs.url ?? '').replace(/</g, '&lt;')}</span>`;
      return { dom };
    };
  }
});
