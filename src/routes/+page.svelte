<script lang="ts">
  import BookCard from '$lib/components/BookCard.svelte';
  import { ArrowRight } from 'phosphor-svelte';

  let { data } = $props();
  const lead = $derived(data.articles[0]);
  const moreArticles = $derived(data.articles.slice(1));
  const fmt = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
</script>

<svelte:head>
  <title>Agone — éditeur engagé</title>
  <meta name="description" content="Éditions Agone — sciences sociales, histoire, littérature et critique du présent. Marseille." />
</svelte:head>

<!-- Derniers parus -->
<section class="mx-auto max-w-7xl px-4 pb-14 pt-10 sm:px-6">
  <div class="mb-6 flex items-end justify-between border-b-2 border-foreground pb-2">
    <h2 class="display-title text-3xl sm:text-4xl">Derniers parus</h2>
    <a href="/catalogue" class="link inline-flex items-center gap-1 pb-1 font-display text-sm font-medium uppercase tracking-wide">Tout le catalogue <ArrowRight size={15} /></a>
  </div>
  <div class="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
    {#each data.recent.slice(0, 12) as book (book.slug)}
      <BookCard {book} />
    {/each}
  </div>
</section>

<!-- L'Antichambre : dernier article -->
{#if lead}
  <section class="border-y border-border bg-secondary/40">
    <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <div class="mb-6 flex items-end justify-between border-b-2 border-foreground pb-2">
        <h2 class="display-title text-3xl sm:text-4xl">L’Antichambre</h2>
        <a href="/antichambre" class="link inline-flex items-center gap-1 pb-1 font-display text-sm font-medium uppercase tracking-wide">Le magazine <ArrowRight size={15} /></a>
      </div>
      <div class="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <!-- Article à la une -->
        <a href="/article/{lead.slug}" class="group block">
          {#if lead.cover_url}
            <div class="mb-4 aspect-[16/9] overflow-hidden rounded-lg border border-border bg-muted">
              <img src={lead.cover_url} alt="" class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
            </div>
          {/if}
          {#if lead.rubrique_name}<span class="eyebrow text-muted-foreground">{lead.rubrique_name}</span>{/if}
          <h3 class="display-title mt-2 text-2xl leading-tight group-hover:text-link sm:text-3xl">{lead.title}</h3>
          {#if lead.excerpt}<p class="mt-2 line-clamp-3 text-muted-foreground">{lead.excerpt}</p>{/if}
          <span class="mt-2 block text-xs text-muted-foreground">{fmt(lead.published_at)}</span>
        </a>
        <!-- Articles récents -->
        <div class="flex flex-col divide-y divide-border border-t border-border">
          {#each moreArticles as a (a.slug)}
            <a href="/article/{a.slug}" class="group py-4">
              {#if a.rubrique_name}<span class="eyebrow text-muted-foreground">{a.rubrique_name}</span>{/if}
              <h4 class="mt-1 font-display text-lg font-medium leading-snug group-hover:text-link">{a.title}</h4>
              <span class="mt-1 block text-xs text-muted-foreground">{fmt(a.published_at)}</span>
            </a>
          {/each}
        </div>
      </div>
    </div>
  </section>
{/if}

<!-- Collections -->
{#if data.collections.length}
  <section class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
    <h2 class="display-title mb-6 border-b-2 border-foreground pb-2 text-3xl sm:text-4xl">Les collections</h2>
    <div class="grid gap-x-8 gap-y-2 font-display sm:grid-cols-2 lg:grid-cols-3">
      {#each data.collections as c (c.slug)}
        <a href="/collections/{c.slug}" class="group flex items-baseline justify-between border-b border-border/70 py-2.5 hover:border-foreground">
          <span class="text-lg font-medium uppercase tracking-wide group-hover:text-link">{c.name}</span>
          <span class="text-sm text-muted-foreground">{c.book_count}</span>
        </a>
      {/each}
    </div>
  </section>
{/if}
