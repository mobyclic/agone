<script lang="ts">
  /**
   * Grille de couvertures pour colonne latérale (fiches livre et auteur) :
   * couvertures seules, titre (et auteur si demandé) en surimpression au survol
   * et au focus clavier. `colonnes` = 2 (grandes) ou 3 (petites).
   *
   * Les couvertures ne sont PAS rognées : toutes les collections n'ont pas le même
   * format (la Revue est presque carrée), et un recadrage coupait les titres. Elles
   * sont donc contenues dans un cadre 2:3, centrées en bas.
   */
  interface Livre { slug: string; title: string; cover_url?: string; authors?: { name: string }[] }
  let { livres, colonnes = 3, avecAuteur = false, etendu = false }: {
    livres: Livre[]; colonnes?: 2 | 3; avecAuteur?: boolean;
    /** Pleine largeur : mêmes tailles de couverture que la version colonne
     *  (≈194 px / ≈127 px), mais autant par rangée que la place le permet. */
    etendu?: boolean;
  } = $props();
  const grand = $derived(colonnes === 2);
</script>

<ul
  class="grid {etendu ? '' : 'max-w-[400px]'} {grand ? 'gap-3' : 'gap-2.5'} {etendu ? '' : grand ? 'grid-cols-2' : 'grid-cols-3'}"
  style={etendu ? `grid-template-columns: repeat(auto-fill, ${grand ? '194px' : '127px'})` : undefined}
>
  {#each livres as s (s.slug)}
    <li>
      <a href="/livre/{s.slug}" class="group relative block overflow-hidden border border-border bg-muted focus:outline-none">
        {#if s.cover_url}
          <img src={s.cover_url} alt={s.title} loading="lazy" class="block aspect-[2/3] w-full bg-secondary/40 object-contain object-bottom transition-transform duration-300 group-hover:scale-[1.04]" />
        {:else}
          <span class="flex aspect-[2/3] items-end bg-ink {grand ? 'p-2' : 'p-1.5'}"><span class="font-display {grand ? 'text-xs' : 'text-[10px]'} uppercase leading-tight text-white">{s.title}</span></span>
        {/if}
        <span class="pointer-events-none absolute inset-0 flex flex-col justify-end gap-0.5 bg-ink/75 {grand ? 'p-2.5' : 'p-1.5'} opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
          <span class="line-clamp-4 font-display {grand ? 'text-sm' : 'text-[11px]'} font-medium uppercase leading-tight text-white">{s.title}</span>
          {#if avecAuteur && s.authors?.length}
            <span class="line-clamp-1 font-display text-[10px] uppercase tracking-wide text-white/70">{s.authors[0].name}</span>
          {/if}
        </span>
      </a>
    </li>
  {/each}
</ul>
