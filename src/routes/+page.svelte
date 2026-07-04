<script lang="ts">
  import BookCard from '$lib/components/BookCard.svelte';
  import SectionHead from '$lib/components/SectionHead.svelte';
  import { authorList } from '$lib/labels';
  import { MapPin } from 'phosphor-svelte';

  let { data } = $props();
  const article = $derived(data.feature ?? data.articles[0]);
  const lede = $derived(article?.summary ?? article?.excerpt);
  const books = $derived(data.recent.slice(0, 6));
  const fmt = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  const dayNum = (s?: string) => (s ? new Date(s).getDate() : '');
  const monShort = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { month: 'short' }) : '');
</script>

<svelte:head>
  <title>Agone — éditeur engagé</title>
  <meta name="description" content="Éditions Agone — sciences sociales, histoire, littérature et critique du présent. Marseille." />
</svelte:head>

<!-- HERO — DERNIER ARTICLE EN MANCHETTE + 4 DERNIERS LIVRES -->
<section class="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 lg:pt-14">
  <div class="grid gap-x-12 gap-y-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">

    <!-- Manchette : le dernier article de L'Antichambre -->
    {#if article}
      <div class="flex flex-col lg:border-r lg:border-border lg:pr-12">
        <div class="mb-7 flex items-end justify-between gap-4 border-b-[3px] border-foreground pb-2.5">
          <span class="eyebrow">L’Antichambre</span>
          <a href="/antichambre" class="link shrink-0 font-display text-xs font-semibold uppercase tracking-wider">Le magazine →</a>
        </div>

        {#if article.rubrique_name}
          <a href="/antichambre?rubrique={article.rubrique_slug}" class="tick-label w-fit hover:text-link">{article.rubrique_name}</a>
        {/if}

        <a href="/article/{article.slug}" class="group mt-5 block">
          <h1 class="display-title break-words text-4xl leading-[0.92] group-hover:text-link sm:text-5xl lg:text-[3.25rem] xl:text-6xl">{article.title}</h1>
        </a>

        {#if article.author || article.published_at}
          <p class="mt-5 font-display text-sm uppercase tracking-[0.14em] text-muted-foreground">
            {#if article.author}<span class="text-foreground">{article.author}</span>{/if}{#if article.author && article.published_at} · {/if}{#if article.published_at}{fmt(article.published_at)}{/if}
          </p>
        {/if}

        {#if lede}
          <p class="ag-lede mt-6 max-w-prose text-base leading-relaxed text-foreground/80 sm:text-[1.0625rem]">{lede}</p>
        {/if}

        <a href="/article/{article.slug}" class="link mt-7 inline-flex w-fit items-center gap-2 font-display text-sm font-semibold uppercase tracking-wider">
          Lire l’article <span aria-hidden="true">→</span>
        </a>
      </div>
    {/if}

    <!-- Vitrine : les 4 derniers livres parus -->
    {#if books.length}
      <div class="flex flex-col {article ? '' : 'lg:col-span-2'}">
        <div class="mb-7 flex items-end justify-between gap-4 border-b-[3px] border-foreground pb-2.5">
          <span class="eyebrow">Derniers parus</span>
          <a href="/catalogue" class="link shrink-0 font-display text-xs font-semibold uppercase tracking-wider">Le catalogue →</a>
        </div>

        <div class="grid grid-cols-3 gap-x-6 gap-y-10">
          {#each books as book (book.slug)}
            <a href="/livre/{book.slug}" class="group flex min-w-0 flex-col">
              <div class="relative aspect-[2/3] overflow-hidden border border-border bg-secondary/40 transition-colors group-hover:border-foreground">
                {#if book.cover_url}
                  <img src={book.cover_url} alt={book.title} loading="lazy" class="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                {:else}
                  <div class="flex size-full items-end bg-ink p-2.5 text-white">
                    <span class="line-clamp-5 font-display text-xs font-semibold uppercase leading-tight">{book.title}</span>
                  </div>
                {/if}
                {#if book.status === 'forthcoming'}
                  <span class="absolute left-0 top-0 bg-ink px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-white">À paraître</span>
                {/if}
              </div>
              <div class="mt-3">
                <h3 class="line-clamp-2 font-sans text-[15px] font-bold leading-snug text-foreground group-hover:text-link">{book.title}</h3>
                {#if book.subtitle}<p class="mt-0.5 line-clamp-2 text-sm leading-snug text-muted-foreground">{book.subtitle}</p>{/if}
                {#if book.authors?.length}<p class="mt-1 line-clamp-1 text-sm text-link">{authorList(book.authors)}</p>{/if}
              </div>
            </a>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</section>

<!-- MIS EN AVANT -->
{#if data.featured.length}
  <section class="border-y border-border bg-secondary/40">
    <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <SectionHead title="Mis en avant" href="/catalogue" more="Le catalogue" />
      <div class="grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
        {#each data.featured as book (book.slug)}<BookCard {book} />{/each}
      </div>
    </div>
  </section>
{/if}

<!-- À PARAÎTRE -->
{#if data.forthcoming.length}
  <section class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
    <SectionHead title="À paraître" href="/catalogue" more="Souscriptions" />
    <div class="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-6">
      {#each data.forthcoming as book (book.slug)}<BookCard {book} />{/each}
    </div>
  </section>
{/if}

<!-- RENCONTRES -->
{#if data.events.length}
  <section class="border-y border-border bg-secondary/40">
    <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
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

<!-- COLLECTIONS -->
{#if data.collections.length}
  <section class="border-t border-border">
    <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
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
