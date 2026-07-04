<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import BookCard from '$lib/components/BookCard.svelte';
  import { ArrowRight } from 'phosphor-svelte';

  let { data } = $props();
  const highlight = $derived(data.featured.length ? data.featured : data.recent.slice(0, 6));
</script>

<svelte:head>
  <title>Agone — éditeur engagé</title>
  <meta name="description" content="Éditions Agone — sciences sociales, histoire, littérature et critique du présent. Marseille." />
</svelte:head>

<!-- Hero -->
<section class="relative overflow-hidden bg-sidebar text-sidebar-foreground">
  <div class="bg-grid-fade absolute inset-0 opacity-[0.12]"></div>
  <div class="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
    <p class="eyebrow" style="color:var(--sidebar-primary)">Éditeur engagé — Marseille</p>
    <h1 class="mt-4 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
      Des livres pour comprendre&nbsp;— et transformer&nbsp;— le monde.
    </h1>
    <p class="mt-5 max-w-xl text-lg text-sidebar-foreground/70">
      Sciences sociales, histoire, littérature et critique du présent.
    </p>
    <div class="mt-8 flex flex-wrap gap-3">
      <Button href="/catalogue" variant="brand" size="lg">Explorer le catalogue <ArrowRight size={18} /></Button>
      <Button href="/auteurs" variant="outline" size="lg" class="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent">
        Les auteurs
      </Button>
    </div>
  </div>
</section>

<!-- À la une -->
<section class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
  <div class="flex items-end justify-between">
    <h2 class="text-2xl font-bold tracking-tight">{data.featured.length ? 'À la une' : 'Derniers parus'}</h2>
    <a href="/catalogue" class="text-sm font-medium text-primary hover:underline">Tout le catalogue →</a>
  </div>
  <div class="mt-6 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
    {#each highlight as book (book.slug)}
      <BookCard {book} />
    {/each}
  </div>
</section>

<!-- Collections -->
{#if data.collections.length}
  <section class="border-t border-border bg-secondary/40">
    <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <h2 class="text-2xl font-bold tracking-tight">Les collections</h2>
      <div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each data.collections as c (c.slug)}
          <a href="/collections/{c.slug}" class="group flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary">
            <span class="font-semibold group-hover:text-primary">{c.name}</span>
            <span class="text-sm text-muted-foreground">{c.book_count}</span>
          </a>
        {/each}
      </div>
    </div>
  </section>
{/if}

<!-- Derniers parus (si à la une existait) -->
{#if data.featured.length}
  <section class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
    <h2 class="text-2xl font-bold tracking-tight">Derniers parus</h2>
    <div class="mt-6 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {#each data.recent as book (book.slug)}
        <BookCard {book} />
      {/each}
    </div>
  </section>
{/if}
