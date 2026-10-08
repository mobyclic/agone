/**
 * Publications de réseaux sociaux intégrées dans un texte (client-safe).
 *
 * L'éditeur stocke une publication sous la forme
 *   <figure class="reseau-social" data-reseau="instagram" data-url="https://…"></figure>
 * et le site la monte côté client (`$lib/client/embeds.ts`) une fois le
 * consentement « marketing » donné — tous ces lecteurs déposent des cookies tiers.
 */
export type Reseau = 'instagram' | 'facebook' | 'x' | 'tiktok' | 'youtube' | 'vimeo' | 'bluesky';

export const RESEAUX: Record<Reseau, { label: string; exemple: string }> = {
  instagram: { label: 'Instagram', exemple: 'https://www.instagram.com/p/…' },
  facebook: { label: 'Facebook', exemple: 'https://www.facebook.com/…/posts/…' },
  x: { label: 'X (Twitter)', exemple: 'https://x.com/…/status/…' },
  tiktok: { label: 'TikTok', exemple: 'https://www.tiktok.com/@…/video/…' },
  youtube: { label: 'YouTube', exemple: 'https://www.youtube.com/watch?v=…' },
  vimeo: { label: 'Vimeo', exemple: 'https://vimeo.com/…' },
  bluesky: { label: 'Bluesky', exemple: 'https://bsky.app/profile/…/post/…' }
};

export const RESEAUX_LISTE = Object.keys(RESEAUX) as Reseau[];

function hote(url: string): string {
  try { return new URL(url).hostname.replace(/^www\.|^m\./, '').toLowerCase(); } catch { return ''; }
}
function chemin(url: string): string {
  try { return new URL(url).pathname; } catch { return ''; }
}

/** Identifiant de vidéo YouTube (watch?v=, youtu.be/, /shorts/, /embed/, /live/). */
export function idYoutube(url: string): string | null {
  const h = hote(url);
  if (h === 'youtu.be') return chemin(url).slice(1).split('/')[0] || null;
  if (!/(^|\.)youtube(-nocookie)?\.com$/.test(h)) return null;
  try {
    const u = new URL(url);
    const v = u.searchParams.get('v');
    if (v) return v;
    const m = u.pathname.match(/\/(?:shorts|embed|live|v)\/([\w-]{6,})/);
    return m ? m[1] : null;
  } catch { return null; }
}

/** Identifiant numérique d'une vidéo Vimeo (vimeo.com/123, player.vimeo.com/video/123). */
export function idVimeo(url: string): string | null {
  if (!/(^|\.)vimeo\.com$/.test(hote(url))) return null;
  const m = chemin(url).match(/\/(?:video\/)?(\d{5,})(?:\/|$)/);
  return m ? m[1] : null;
}

/** Identifiant d'une vidéo TikTok (…/video/123). */
export function idTiktok(url: string): string | null {
  if (!/(^|\.)tiktok\.com$/.test(hote(url))) return null;
  const m = chemin(url).match(/\/video\/(\d+)/);
  return m ? m[1] : null;
}

/** Bluesky : handle (ou DID) et clé de la publication (bsky.app/profile/<handle>/post/<rkey>). */
export function refBluesky(url: string): { acteur: string; rkey: string } | null {
  if (hote(url) !== 'bsky.app') return null;
  const m = chemin(url).match(/\/profile\/([^/]+)\/post\/([^/]+)/);
  return m ? { acteur: m[1], rkey: m[2] } : null;
}

/** Reconnaît le réseau d'après l'adresse d'une publication ; null si inconnue. */
export function detecterReseau(url: string): Reseau | null {
  const h = hote(url);
  if (!h) return null;
  if (/(^|\.)instagram\.com$/.test(h)) return /^\/(p|reel|reels|tv)\//.test(chemin(url)) ? 'instagram' : null;
  if (/(^|\.)(facebook\.com|fb\.com|fb\.watch)$/.test(h)) return 'facebook';
  if (/(^|\.)(twitter\.com|x\.com)$/.test(h)) return /\/status\/\d+/.test(chemin(url)) ? 'x' : null;
  if (idTiktok(url)) return 'tiktok';
  if (idYoutube(url)) return 'youtube';
  if (idVimeo(url)) return 'vimeo';
  if (refBluesky(url)) return 'bluesky';
  return null;
}

/**
 * Adresse canonique à stocker : sans paramètres de suivi (utm, igsh, si…),
 * en https, et pour Instagram / X / TikTok sans aucun paramètre.
 */
export function nettoyerUrl(url: string, reseau: Reseau | null = detecterReseau(url)): string {
  try {
    const u = new URL(url.trim());
    u.protocol = 'https:';
    u.hash = '';
    if (reseau === 'youtube') {
      const id = idYoutube(url);
      return id ? `https://www.youtube.com/watch?v=${id}` : u.toString();
    }
    if (reseau === 'vimeo') {
      const id = idVimeo(url);
      return id ? `https://vimeo.com/${id}` : u.toString();
    }
    if (reseau === 'facebook') {
      for (const k of Array.from(u.searchParams.keys())) if (/^(utm_|fbclid|mibextid|rdid|share_url)/.test(k)) u.searchParams.delete(k);
      return u.toString();
    }
    u.search = '';
    if (reseau === 'x') u.hostname = 'x.com';
    return u.toString();
  } catch { return url.trim(); }
}
