<script lang="ts">
  import BookCard from '$lib/components/BookCard.svelte';
  import SectionHead from '$lib/components/SectionHead.svelte';
  import { CalendarBlank, MapPin } from 'phosphor-svelte';

  let { data } = $props();
  const lead = $derived(data.articles[0]);
  const secondary = $derived(data.articles.slice(1, 4));
  const fmt = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  const dayNum = (s?: string) => (s ? new Date(s).getDate() : '');
  const monShort = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { month: 'short' }) : '');
</script>

<svelte:head>
  <title>Agone — éditeur engagé</title>
  <meta name="description" content="Éditions Agone — sciences sociales, histoire, littérature et critique du présent. Marseille." />
</svelte:head>

<!-- L'ANTICHAMBRE (éditorial en tête) -->
{#if lead}
  <section class="mx-auto max-w-7xl px-4 pb-16 pt-12 sm:px-6">
    <SectionHead title="L’Antichambre" href="/antichambre" more="Le magazine" />
    <div class="grid gap-10 lg:grid-cols-[1.55fr_1fr]">
      <!-- Une -->
      <article>
        <a href="/article/{lead.slug}" class="group block">
          {#if lead.cover_url}
            <div class="mb-5 aspect-[16/9] overflow-hidden border border-border bg-muted">
              <img src={lead.cover_url} alt="" class="size-full object-cover grayscale transition-all duration-500 group-hover:grayscale-0" />
            </div>
          {/if}
          {#if lead.rubrique_name}<span class="tick-label">{lead.rubrique_name}</span>{/if}
          <h3 class="display-title mt-3 text-4xl leading-[0.95] group-hover:text-link sm:text-5xl">{lead.title}</h3>
        </a>
        <p class="mt-3 text-sm text-muted-foreground">
          {#if lead.author}<span class="text-foreground">{lead.author}</span> · {/if}{fmt(lead.published_at)}
          {#if lead.rubrique_name} · <a href="/antichambre?rubrique={lead.rubrique_slug}" class="link">{lead.rubrique_name}</a>{/if}
        </p>
        {#if lead.excerpt}<p class="mt-3 max-w-2xl leading-relaxed text-foreground/80">{lead.excerpt}</p>{/if}
      </article>

      <!-- Récents -->
      <div class="flex flex-col border-t-2 border-foreground">
        {#each secondary as a (a.slug)}
          <a href="/article/{a.slug}" class="group border-b border-border py-5">
            {#if a.rubrique_name}<span class="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">{a.rubrique_name}</span>{/if}
            <h4 class="display-title mt-1 text-2xl leading-tight group-hover:text-link">{a.title}</h4>
            <p class="mt-1.5 text-xs text-muted-foreground">{#if a.author}{a.author} · {/if}{fmt(a.published_at)}</p>
          </a>
        {/each}
      </div>
    </div>
  </section>
{/if}

<!-- RENCONTRES -->
{#if data.events.length}
  <section class="border-y border-border bg-secondary/50">
    <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <SectionHead title="Rencontres" href="/rencontres" more="L’agenda" />
      <div class="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
        {#each data.events as e (e.slug)}
          <a href="/rencontres/{e.slug}" class="group flex flex-col bg-background p-5">
            <div class="flex items-baseline gap-2 font-display">
              <span class="text-4xl font-bold leading-none">{dayNum(e.start_at)}</span>
              <span class="text-sm uppercase text-muted-foreground">{monShort(e.start_at)}</span>
            </div>
            <h3 class="mt-3 line-clamp-3 font-display text-lg font-medium leading-tight group-hover:text-link">{e.title}</h3>
            {#if e.venue_name}<p class="mt-auto pt-3 text-xs text-muted-foreground"><MapPin size={12} class="mb-0.5 mr-0.5 inline" />{e.venue_name}{e.venue_city ? `, ${e.venue_city}` : ''}</p>{/if}
          </a>
        {/each}
      </div>
    </div>
  </section>
{/if}

<!-- DERNIERS PARUS -->
<section class="mx-auto max-w-7xl px-4 py-16 sm:px-6">
  <SectionHead title="Derniers parus" href="/catalogue" more="Le catalogue" />
  <div class="grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
    {#each data.recent as book (book.slug)}
      <BookCard {book} />
    {/each}
  </div>
</section>

<!-- COLLECTIONS -->
{#if data.collections.length}
  <section class="border-t border-border">
    <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <SectionHead title="Les collections" href="/catalogue" more="Explorer" />
      <div class="grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
        {#each data.collections as c (c.slug)}
          <a href="/collections/{c.slug}" class="group flex items-baseline justify-between border-b border-border py-3 font-display hover:border-foreground">
            <span class="text-xl font-medium uppercase tracking-wide group-hover:text-link">{c.name}</span>
            <span class="text-sm text-muted-foreground">{c.book_count}</span>
          </a>
        {/each}
      </div>
    </div>
  </section>
{/if}
