<script lang="ts">
  import PageHead from '$lib/components/PageHead.svelte';
  import { deburr } from '$lib/text';
  let { data } = $props();

  // Recherche instantanée (client) — insensible à la casse et aux accents.
  let q = $state('');

  const filtered = $derived.by(() => {
    const needle = deburr(q.trim());
    if (!needle) return data.authors;
    return data.authors.filter((a) =>
      deburr(`${a.full_name} ${a.last_name ?? ''} ${a.first_name ?? ''}`).includes(needle)
    );
  });

  const groups = $derived.by(() => {
    const map = new Map<string, { slug: string; label: string }[]>();
    for (const a of filtered) {
      const letter = (a.last_name || a.full_name || '#').trim().charAt(0).toUpperCase();
      const key = /[A-Z]/.test(letter) ? letter : '#';
      const label = `${a.last_name ?? ''} ${a.first_name ?? ''}`.trim() || a.full_name;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ slug: a.slug, label });
    }
    return [...map.entries()].sort((x, y) => x[0].localeCompare(y[0], 'fr'));
  });

  // Index A–Z : uniquement les lettres réellement présentes après filtrage.
  const initials = $derived(groups.map(([l]) => l).filter((l) => /^[A-Z]$/.test(l)));

  const metaText = $derived(
    q.trim()
      ? `${filtered.length} résultat${filtered.length > 1 ? 's' : ''} pour « ${q.trim()} »`
      : `${data.authors.length} contributrices & contributeurs au catalogue`
  );
</script>

<svelte:head><title>Auteurs · Agone</title></svelte:head>

<PageHead eyebrow="Les auteurs" title="Autrices & auteurs" meta={metaText} />

<section class="border-b border-border bg-secondary/40">
  <div class="mx-auto max-w-6xl px-4 py-6 sm:px-6">
    <input
      bind:value={q}
      type="search"
      placeholder="Rechercher un auteur…"
      autocomplete="off"
      class="h-11 w-full max-w-md rounded-md border border-border bg-background px-3.5 text-sm outline-none focus:border-primary" />

    <!-- Index A–Z (ancres) -->
    <div class="mt-4 flex flex-wrap gap-x-2 gap-y-1 font-display">
      {#each initials as l (l)}
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
