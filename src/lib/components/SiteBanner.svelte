<script lang="ts">
  /**
   * Bandeau (Réclames) : barre fixée en bas de l'écran, blanc sur noir.
   * Refermable : le choix est mémorisé par message (un nouveau bandeau réapparaît).
   * Publie sa hauteur dans --bandeau-h pour que les boutons flottants restent au-dessus.
   */
  import { X } from 'phosphor-svelte';

  let { banner }: { banner: { active: boolean; message: string; url?: string } | null } = $props();

  const cle = $derived(banner?.active && banner.message ? `ag_bandeau_ferme:${banner.message}` : '');
  // Rendu après lecture du choix du visiteur : pas de bandeau qui clignote puis disparaît.
  let visible = $state(false);
  let hauteur = $state(0);

  $effect(() => {
    if (!cle) { visible = false; return; }
    let ferme = false;
    try { ferme = localStorage.getItem(cle) === '1'; } catch { /* stockage indisponible */ }
    visible = !ferme;
  });
  $effect(() => {
    document.documentElement.style.setProperty('--bandeau-h', `${visible ? hauteur : 0}px`);
    return () => document.documentElement.style.removeProperty('--bandeau-h');
  });

  function fermer() {
    visible = false;
    try { localStorage.setItem(cle, '1'); } catch { /* stockage indisponible */ }
  }
</script>

{#if visible && banner}
  <!-- Réserve la place sous le pied de page : la barre ne masque jamais la fin de la page. -->
  <div aria-hidden="true" style:height="{hauteur}px"></div>
  <div bind:offsetHeight={hauteur} class="fixed inset-x-0 bottom-0 z-50 bg-foreground text-background" role="status">
    <div class="relative px-12 py-2.5 text-center font-display text-sm uppercase tracking-wide">
      {#if banner.url}<a href={banner.url} class="underline-offset-4 hover:underline">{banner.message}</a>{:else}{banner.message}{/if}
      <button type="button" onclick={fermer} class="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center text-background/60 transition-colors hover:text-background" aria-label="Fermer le bandeau" title="Fermer"><X size={16} /></button>
    </div>
  </div>
{/if}
