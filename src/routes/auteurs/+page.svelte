<script lang="ts">
  let { data } = $props();

  const groups = $derived.by(() => {
    const map = new Map<string, { slug: string; label: string }[]>();
    for (const a of data.authors) {
      const letter = (a.last_name || a.full_name || '#').trim().charAt(0).toUpperCase();
      const key = /[A-Z]/.test(letter) ? letter : '#';
      const label = `${a.last_name ?? ''} ${a.first_name ?? ''}`.trim() || a.full_name;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ slug: a.slug, label });
    }
    return [...map.entries()].sort((x, y) => x[0].localeCompare(y[0], 'fr'));
  });
</script>

<svelte:head><title>Auteurs · Agone</title></svelte:head>

<section class="border-b border-border bg-secondary/50">
  <div class="mx-auto max-w-6xl px-4 py-10 sm:px-6">
    <p class="eyebrow">Les auteurs</p>
    <h1 class="display-title mt-1 text-5xl sm:text-6xl">Autrices &amp; auteurs</h1>
    <p class="mt-2 text-muted-foreground">{data.authors.length} contributrices &amp; contributeurs au catalogue.</p>

    <form method="GET" class="mt-6 max-w-md">
      <input name="q" value={data.q ?? ''} placeholder="Rechercher un auteur…"
        class="h-11 w-full rounded-md border border-border bg-background px-3.5 text-sm outline-none focus:border-primary" />
    </form>

    <!-- Index A–Z (ancres) -->
    <div class="mt-4 flex flex-wrap gap-x-2 gap-y-1 font-display">
      {#each data.initials as l (l)}
        <a href="#lettre-{l}" class="text-sm font-semibold text-muted-foreground hover:text-link">{l}</a>
      {/each}
    </div>
  </div>
</section>

<section class="mx-auto max-w-6xl px-4 py-10 sm:px-6">
  {#if groups.length === 0}
    <p class="py-16 text-center text-muted-foreground">Aucun auteur trouvé.</p>
  {:else}
    <div class="space-y-10">
      {#each groups as [letter, authors] (letter)}
        <div id="lettre-{letter}" class="grid scroll-mt-20 gap-x-8 gap-y-2 sm:grid-cols-[4rem_1fr]">
          <div class="display-title text-5xl leading-none text-foreground sm:text-6xl">{letter}</div>
          <ul class="columns-1 gap-x-10 sm:columns-2 lg:columns-3">
            {#each authors as a (a.slug)}
              <li class="break-inside-avoid">
                <a href="/auteur/{a.slug}" class="link inline-block py-0.5 leading-snug">{a.label}</a>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  {/if}
</section>
