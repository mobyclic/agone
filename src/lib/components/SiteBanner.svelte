<script lang="ts">
  /** Bandeau d'information (Réclames) : une ligne au-dessus du menu. */
  let { banner }: { banner: { active: boolean; message: string; variant: string; url?: string } | null } = $props();
  const STYLES: Record<string, string> = {
    info: 'bg-foreground text-background', brand: 'bg-primary text-primary-foreground', warning: 'bg-warning text-foreground', success: 'bg-success text-white'
  };
</script>

{#if banner?.active && banner.message}
  <div class="px-4 py-2 text-center font-display text-sm uppercase tracking-wide {STYLES[banner.variant] ?? STYLES.info}" role="status">
    {#if banner.url}<a href={banner.url} class="underline-offset-4 hover:underline">{banner.message}</a>{:else}{banner.message}{/if}
  </div>
{/if}
