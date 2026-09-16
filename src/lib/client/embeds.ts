/**
 * Intégrations tierces posées dans le contenu éditorial (WordPress collait le
 * code d'intégration Instagram directement dans le corps du texte).
 *
 * DEUX PROBLÈMES À RÉGLER, ET LE SECOND EST LE PLUS IMPORTANT :
 *
 * 1. `{@html}` n'exécute PAS les <script> qu'il insère : le <blockquote> arrivait
 *    donc nu, d'où le grand cadre vide avec « Voir cette publication sur
 *    Instagram ». Il faut charger `embed.js` nous-mêmes puis appeler
 *    `instgrm.Embeds.process()`.
 *
 * 2. `embed.js` est un script Meta qui dépose des cookies : il relève de la
 *    catégorie `marketing` de notre CMP (cf. $lib/consent, qui cite explicitement
 *    Instagram). Le charger d'office contredirait la bannière que l'on affiche.
 *    Sans consentement on pose donc un ersatz sobre : le lien vers la publication
 *    et un bouton qui rouvre la bannière. Dès l'accord (événement `ag:consent`),
 *    l'intégration se charge sans rechargement de page.
 */
import { readConsent } from '$lib/consent';

const EMBED_JS = 'https://www.instagram.com/embed.js';
let chargement: Promise<boolean> | null = null;

function chargerInstagram(): Promise<boolean> {
  if (!chargement) {
    chargement = new Promise<boolean>((resoudre) => {
      if ((window as any).instgrm) return resoudre(true);
      const s = document.createElement('script');
      s.src = EMBED_JS;
      s.async = true;
      s.onload = () => resoudre(true);
      s.onerror = () => { chargement = null; resoudre(false); };  // réseau coupé : on pourra réessayer
      document.head.appendChild(s);
    });
  }
  return chargement;
}

const MARQUE = 'data-ag-embed';

function ersatz(bq: HTMLElement): HTMLElement {
  const lien = bq.getAttribute('data-instgrm-permalink')?.split('?')[0] ?? '';
  const d = document.createElement('div');
  d.setAttribute(MARQUE, 'placeholder');
  d.className =
    'my-4 flex max-w-[540px] flex-col items-start gap-2 border border-border bg-secondary/40 p-4 text-sm';
  d.innerHTML =
    '<p class="font-medium">Publication Instagram</p>' +
    '<p class="text-muted-foreground">Son affichage dépose des cookies Meta. ' +
    'Vous pouvez l’autoriser, ou ouvrir la publication directement.</p>' +
    '<div class="flex flex-wrap items-center gap-3 pt-1">' +
    '<button type="button" data-ag-consent class="border border-foreground px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wide hover:bg-foreground hover:text-background">Autoriser l’affichage</button>' +
    (lien
      ? `<a href="${lien}" target="_blank" rel="noopener" class="text-link underline-offset-4 hover:underline">Voir sur Instagram →</a>`
      : '') +
    '</div>';
  d.querySelector('[data-ag-consent]')?.addEventListener('click', () => {
    window.dispatchEvent(new Event('open-consent-banner'));
  });
  return d;
}

function appliquer(node: HTMLElement) {
  const blocs = Array.from(node.querySelectorAll<HTMLElement>('blockquote.instagram-media'));
  if (!blocs.length) return;
  const autorise = readConsent()?.marketing === true;

  // Nettoie les ersatz d'un passage précédent (le consentement a pu changer).
  node.querySelectorAll(`[${MARQUE}="placeholder"]`).forEach((e) => e.remove());

  if (!autorise) {
    for (const bq of blocs) {
      bq.style.display = 'none';
      bq.parentNode?.insertBefore(ersatz(bq), bq);
    }
    return;
  }

  for (const bq of blocs) bq.style.removeProperty('display');
  void chargerInstagram().then((ok) => {
    if (ok) (window as any).instgrm?.Embeds?.process?.();
  });
}

/** Action Svelte : `<div use:embedsSociaux>{@html …}</div>`. */
export function embedsSociaux(node: HTMLElement) {
  appliquer(node);
  const surConsentement = () => appliquer(node);
  window.addEventListener('ag:consent', surConsentement);
  return {
    update: () => appliquer(node),
    destroy: () => window.removeEventListener('ag:consent', surConsentement)
  };
}
