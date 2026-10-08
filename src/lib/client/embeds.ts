/**
 * Publications de réseaux sociaux posées dans le contenu éditorial.
 *
 * L'éditeur stocke `<figure class="reseau-social" data-reseau data-url>` ; les
 * textes migrés de WordPress peuvent encore contenir l'ancien
 * `<blockquote class="instagram-media">`, converti ici à la volée.
 *
 * DEUX CONTRAINTES :
 *
 * 1. `{@html}` n'exécute PAS les <script> : on charge nous-mêmes les lecteurs
 *    (embed.js Instagram, widgets.js X, SDK Facebook, embed.js TikTok) ou on
 *    pose l'iframe (YouTube, Vimeo, Bluesky).
 *
 * 2. Tous ces lecteurs déposent des cookies tiers : ils relèvent de la catégorie
 *    `marketing` de notre CMP ($lib/consent). Sans consentement on pose un
 *    ersatz sobre — lien vers la publication + bouton qui rouvre la bannière.
 *    Dès l'accord (événement `ag:consent`), le lecteur se monte sans rechargement.
 */
import { readConsent } from '$lib/consent';
import { RESEAUX, detecterReseau, idTiktok, idVimeo, idYoutube, nettoyerUrl, refBluesky, type Reseau } from '$lib/reseauxSociaux';

const scripts = new Map<string, Promise<boolean>>();
function chargerScript(src: string): Promise<boolean> {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise<boolean>((resoudre) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resoudre(true);
      s.onerror = () => { scripts.delete(src); resoudre(false); }; // réseau coupé : on pourra réessayer
      document.head.appendChild(s);
    });
    scripts.set(src, p);
  }
  return p;
}

function ersatz(reseau: Reseau | null, url: string): HTMLElement {
  const nom = reseau ? RESEAUX[reseau].label : 'réseau social';
  const d = document.createElement('div');
  d.className = 'flex flex-col items-start gap-2 border border-border bg-secondary/40 p-4 text-sm';
  d.innerHTML =
    `<p class="font-medium">Publication ${nom}</p>` +
    '<p class="text-muted-foreground">Son affichage dépose des cookies tiers. ' +
    'Vous pouvez l’autoriser, ou ouvrir la publication directement.</p>' +
    '<div class="flex flex-wrap items-center gap-3 pt-1">' +
    '<button type="button" data-ag-consent class="border border-foreground px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wide hover:bg-foreground hover:text-background">Autoriser l’affichage</button>' +
    (url ? `<a href="${url}" target="_blank" rel="noopener" class="text-link underline-offset-4 hover:underline">Voir sur ${nom} →</a>` : '') +
    '</div>';
  d.querySelector('[data-ag-consent]')?.addEventListener('click', () => {
    window.dispatchEvent(new Event('open-consent-banner'));
  });
  return d;
}

function iframe(src: string, opts: { ratio?: boolean; hauteur?: number; titre: string }): HTMLIFrameElement {
  const f = document.createElement('iframe');
  f.src = src;
  f.title = opts.titre;
  f.loading = 'lazy';
  f.allowFullscreen = true;
  f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; clipboard-write; web-share');
  f.style.border = '0';
  f.style.width = '100%';
  if (opts.ratio) f.style.aspectRatio = '16 / 9';
  else f.style.height = `${opts.hauteur ?? 400}px`;
  return f;
}

let ecouteBluesky = false;
function ecouterBluesky() {
  if (ecouteBluesky) return;
  ecouteBluesky = true;
  // Le lecteur Bluesky annonce sa hauteur par postMessage ({ type: 'height', id, height }).
  window.addEventListener('message', (ev) => {
    if (ev.origin !== 'https://embed.bsky.app' || ev.data?.type !== 'height') return;
    const f = document.querySelector<HTMLIFrameElement>(`iframe[data-bluesky-id="${CSS.escape(String(ev.data.id))}"]`);
    if (f && ev.data.height) f.style.height = `${ev.data.height}px`;
  });
}

async function monter(fig: HTMLElement, reseau: Reseau, url: string) {
  switch (reseau) {
    case 'instagram': {
      fig.innerHTML = `<blockquote class="instagram-media" data-instgrm-permalink="${url}" data-instgrm-version="14" style="margin:0;max-width:540px;min-width:280px;width:100%"></blockquote>`;
      if (await chargerScript('https://www.instagram.com/embed.js')) (window as any).instgrm?.Embeds?.process?.();
      return;
    }
    case 'x': {
      fig.innerHTML = `<blockquote class="twitter-tweet" data-dnt="true"><a href="${url}"></a></blockquote>`;
      if (await chargerScript('https://platform.twitter.com/widgets.js')) (window as any).twttr?.widgets?.load?.(fig);
      return;
    }
    case 'tiktok': {
      fig.innerHTML = `<blockquote class="tiktok-embed" cite="${url}" data-video-id="${idTiktok(url) ?? ''}" style="max-width:605px;min-width:325px"><section></section></blockquote>`;
      // Le script TikTok ne traite la page qu'à son chargement : on en pose un neuf à chaque montage.
      const s = document.createElement('script');
      s.src = 'https://www.tiktok.com/embed.js';
      s.async = true;
      fig.appendChild(s);
      return;
    }
    case 'facebook': {
      fig.innerHTML = `<div id="fb-root"></div><div class="fb-post" data-href="${url}" data-width="500" data-show-text="true"></div>`;
      if (await chargerScript('https://connect.facebook.net/fr_FR/sdk.js#xfbml=1&version=v21.0')) (window as any).FB?.XFBML?.parse?.(fig);
      return;
    }
    case 'youtube': {
      const id = idYoutube(url);
      if (id) fig.appendChild(iframe(`https://www.youtube-nocookie.com/embed/${id}`, { ratio: true, titre: 'Vidéo YouTube' }));
      return;
    }
    case 'vimeo': {
      const id = idVimeo(url);
      if (id) fig.appendChild(iframe(`https://player.vimeo.com/video/${id}?dnt=1`, { ratio: true, titre: 'Vidéo Vimeo' }));
      return;
    }
    case 'bluesky': {
      const ref = refBluesky(url);
      if (!ref) return;
      let did = ref.acteur;
      if (!did.startsWith('did:')) {
        // Le lecteur n'accepte que le DID : on résout le handle via l'API publique (sans cookie).
        try {
          const r = await fetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(did)}`);
          did = (await r.json()).did ?? '';
        } catch { did = ''; }
      }
      if (!did) { fig.appendChild(ersatz(reseau, url)); return; }
      const id = Math.random().toString(36).slice(2);
      ecouterBluesky();
      const f = iframe(`https://embed.bsky.app/embed/${did}/app.bsky.feed.post/${ref.rkey}?id=${id}`, { hauteur: 300, titre: 'Publication Bluesky' });
      f.dataset.blueskyId = id;
      fig.appendChild(f);
      return;
    }
  }
}

/** Convertit les anciens blockquotes Instagram (WordPress) en figure.reseau-social. */
function convertirAnciens(node: HTMLElement) {
  for (const bq of Array.from(node.querySelectorAll<HTMLElement>('blockquote.instagram-media'))) {
    const url = bq.getAttribute('data-instgrm-permalink');
    if (!url) continue;
    const fig = document.createElement('figure');
    fig.className = 'reseau-social';
    fig.dataset.reseau = 'instagram';
    fig.dataset.url = nettoyerUrl(url, 'instagram');
    bq.replaceWith(fig);
  }
}

function appliquer(node: HTMLElement) {
  convertirAnciens(node);
  const figs = Array.from(node.querySelectorAll<HTMLElement>('figure.reseau-social[data-url]'));
  if (!figs.length) return;
  const autorise = readConsent()?.marketing === true;
  for (const fig of figs) {
    const etat = autorise ? 'monte' : 'ersatz';
    if (fig.dataset.agEtat === etat) continue; // déjà dans le bon état (le consentement n'a pas changé)
    fig.dataset.agEtat = etat;
    fig.innerHTML = '';
    const url = fig.dataset.url ?? '';
    const reseau = (fig.dataset.reseau as Reseau | undefined) ?? detecterReseau(url);
    if (!autorise || !reseau) fig.appendChild(ersatz(reseau ?? null, url));
    else void monter(fig, reseau, url);
  }
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
