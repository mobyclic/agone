<script lang="ts">
  let { data } = $props();
</script>

<svelte:head><title>Auteurs · Agone</title></svelte:head>

<section class="border-b border-border bg-secondary/40">
  <div class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
    <p class="eyebrow">Les auteurs</p>
    <h1 class="mt-1 text-3xl font-extrabold tracking-tight">Autrices &amp; auteurs</h1>
    <p class="mt-2 text-muted-foreground">{data.authors.length} contributeurs au catalogue.</p>

    <form method="GET" class="mt-6 max-w-md">
      <input
        name="q"
        value={data.q ?? ''}
        placeholder="Rechercher un auteur…"
        class="h-11 w-full rounded-md border border-border bg-background px-3.5 text-sm outline-none focus:border-primary"
      />
    </form>

    <!-- Index alphabétique -->
    <div class="mt-4 flex flex-wrap gap-1">
      <a href="/auteurs" class="rounded px-2 py-1 text-sm font-semibold {!data.letter ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}">Tous</a>
      {#each data.initials as l (l)}
        <a href="/auteurs?letter={l}" class="rounded px-2 py-1 text-sm font-semibold {data.letter?.toUpperCase() === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}">{l}</a>
      {/each}
    </div>
  </div>
</section>

<section class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
  {#if data.authors.length === 0}
    <p class="py-16 text-center text-muted-foreground">Aucun auteur trouvé.</p>
  {:else}
    <ul class="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
      {#each data.authors as a (a.slug)}
        <li>
          <a href="/auteur/{a.slug}" class="group flex items-baseline justify-between gap-3 border-b border-border/60 py-2.5 hover:border-primary">
            <span class="font-medium group-hover:text-primary">{a.full_name}</span>
            <span class="shrink-0 text-xs text-muted-foreground">{a.book_count} titre{a.book_count > 1 ? 's' : ''}</span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</section>
