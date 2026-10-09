<script lang="ts">
  /**
   * Fenêtre promotionnelle (Réclames). Apparaît après un délai, se ferme d'un
   * clic ou avec Échap, et ne revient qu'au rythme réglé : une fois (par
   * version du texte), une fois par jour, à chaque visite, à chaque page.
   */
  import { onMount } from 'svelte';
  import { X } from 'phosphor-svelte';
  let { popup }: { popup: { title: string; body: string; cta_label?: string; cta_url?: string; image_url?: string; frequency: string; delay: number; version: string } | null } = $props();
  let visible = $state(false);
  const CLE = 'agone:popup';
  function dejaVue(): boolean {
    if (!popup) return true;
    try {
      const v = JSON.parse((popup.frequency === 'session' ? sessionStorage : localStorage).getItem(CLE) ?? 'null');
      if (!v || v.version !== popup.version) return false;
      if (popup.frequency === 'once' || popup.frequency === 'session') return true;
      if (popup.frequency === 'day') return Date.now() - Number(v.at) < 86400_000;
      return false;
    } catch { return false; }
  }
  function fermer() {
    visible = false;
    try { (popup?.frequency === 'session' ? sessionStorage : localStorage).setItem(CLE, JSON.stringify({ version: popup?.version, at: Date.now() })); } catch { /* stockage indisponible */ }
  }
  onMount(() => {
    if (!popup || dejaVue()) return;
    const t = setTimeout(() => (visible = true), Math.max(0, popup.delay) * 1000);
    return () => clearTimeout(t);
  });
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && visible) fermer(); }} />

{#if visible && popup}
  <div class="fixed inset-0 z-[65] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="popup-titre">
    <button type="button" class="absolute inset-0 cursor-default bg-black/60" aria-label="Fermer" onclick={fermer}></button>
    <div class="relative z-10 w-full max-w-md overflow-hidden bg-background shadow-2xl">
      <button type="button" onclick={fermer} class="absolute right-3 top-3 z-10 grid size-8 place-items-center bg-background/80 text-foreground hover:bg-background" aria-label="Fermer"><X size={18} /></button>
      {#if popup.image_url}<img src={popup.image_url} alt="" class="block max-h-72 w-full object-cover" />{/if}
      <div class="p-6">
        {#if popup.title}<h2 id="popup-titre" class="display-title text-2xl leading-tight">{popup.title}</h2>{/if}
        {#if popup.body}<p class="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground/85">{popup.body}</p>{/if}
        {#if popup.cta_label && popup.cta_url}
          <a href={popup.cta_url} onclick={fermer} class="btn-brand mt-5 inline-flex h-10 items-center px-4 font-display text-sm font-medium uppercase tracking-wide">{popup.cta_label}</a>
        {/if}
      </div>
    </div>
  </div>
{/if}
