import { toast } from 'svelte-sonner';
import { replaceState } from '$app/navigation';

export { toast };

// Empreinte du dernier flash affiché : évite qu'un re-render / polling
// (invalidateAll) ré-affiche le même toast tant que l'URL n'est pas nettoyée.
let lastFlash = '';

/**
 * Affiche un toast passé en query string (?flash=...&flash_type=success) après
 * une redirection serveur, puis nettoie l'URL (via replaceState SvelteKit pour
 * que `page.url` reflète la suppression). Appelé dans le +layout racine.
 */
export function consumeUrlFlash(url: URL) {
  const msg = url.searchParams.get('flash');
  if (!msg) {
    lastFlash = '';
    return;
  }
  const type = url.searchParams.get('flash_type') || 'success';
  const sig = `${type}:${msg}`;
  if (sig === lastFlash) return; // déjà affiché (re-render / polling)
  lastFlash = sig;

  const fn = (toast as any)[type] ?? toast;
  fn(msg);

  // Retire flash/flash_type de l'URL SvelteKit (met à jour page.url → pas de re-toast).
  const clean = new URL(url);
  clean.searchParams.delete('flash');
  clean.searchParams.delete('flash_type');
  try {
    replaceState(clean.pathname + clean.search + clean.hash, {});
    lastFlash = '';
  } catch {
    if (typeof history !== 'undefined') {
      history.replaceState(history.state, '', clean.pathname + clean.search);
    }
  }
}

/** Construit un chemin de redirection avec flash (pour les actions serveur). */
export function withFlash(path: string, message: string, type: 'success' | 'error' | 'info' = 'success') {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}flash=${encodeURIComponent(message)}&flash_type=${type}`;
}
