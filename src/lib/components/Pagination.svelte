<script lang="ts">
  /**
   * Pagination du back-office : Début · Préc. · 1 … 7 8 [9] 10 11 … 99 · Suiv. · Fin.
   * Deux modes : `href` (liens, pagination côté serveur) ou `onpage` (boutons,
   * pagination côté client).
   */
  let {
    page,
    pageCount,
    href,
    onpage,
    autour = 2
  }: {
    page: number;
    pageCount: number;
    href?: (p: number) => string;
    onpage?: (p: number) => void;
    /** Nombre de pages affichées de part et d'autre de la page courante. */
    autour?: number;
  } = $props();

  /** Numéros à afficher, `null` = ellipse. */
  const pages = $derived.by(() => {
    const out: (number | null)[] = [];
    const debut = Math.max(1, page - autour);
    const fin = Math.min(pageCount, page + autour);
    if (debut > 1) { out.push(1); if (debut > 2) out.push(null); }
    for (let p = debut; p <= fin; p++) out.push(p);
    if (fin < pageCount) { if (fin < pageCount - 1) out.push(null); out.push(pageCount); }
    return out;
  });

  const base = 'inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-3 text-sm transition-colors';
  const actif = 'border-foreground bg-foreground text-background';
  const inactif = 'border-border bg-background hover:bg-muted';
  const off = 'pointer-events-none border-border opacity-35';
</script>

{#snippet lien(p: number, texte: string, desactive: boolean, courant = false, label = '')}
  {#if href && !desactive}
    <a href={href(p)} class="{base} {courant ? actif : inactif}" aria-current={courant ? 'page' : undefined} aria-label={label || undefined}>{texte}</a>
  {:else}
    <button type="button" disabled={desactive} onclick={() => onpage?.(p)} class="{base} {courant ? actif : desactive ? off : inactif}" aria-current={courant ? 'page' : undefined} aria-label={label || undefined}>{texte}</button>
  {/if}
{/snippet}

{#if pageCount > 1}
  <nav class="mt-6 flex flex-wrap items-center justify-center gap-1.5" aria-label="Pagination">
    {@render lien(1, 'Début', page <= 1, false, 'Première page')}
    {@render lien(page - 1, '‹ Préc.', page <= 1, false, 'Page précédente')}
    {#each pages as p, i (p ?? `e${i}`)}
      {#if p === null}
        <span class="px-1 text-muted-foreground">…</span>
      {:else}
        {@render lien(p, String(p), false, p === page)}
      {/if}
    {/each}
    {@render lien(page + 1, 'Suiv. ›', page >= pageCount, false, 'Page suivante')}
    {@render lien(pageCount, 'Fin', page >= pageCount, false, 'Dernière page')}
  </nav>
{/if}
