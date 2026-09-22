<script lang="ts">
  import BookCard from '$lib/components/BookCard.svelte';
  import SectionHead from '$lib/components/SectionHead.svelte';
  import EventsExplorer from '$lib/components/EventsExplorer.svelte';
  import { authorList, isForthcoming } from '$lib/labels';
  import { extraitPropre } from '$lib/text';

  let { data } = $props();
  const article = $derived(data.feature ?? data.articles[0]);
  const lede = $derived(article?.summary ?? article?.excerpt);
  const secondary = $derived((data.articles ?? []).filter((a) => a.slug !== article?.slug).slice(0, 3));
  const books = $derived(data.recent.slice(0, 6));
  const fmt = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
</script>

<svelte:head>
  <title>Agone — Éditeur indépendant</title>
  <meta name="description" content="Éditions Agone — Critique politique, sciences sociales & humaines. Marseille." />
</svelte:head>

<!-- HERO — DERNIER ARTICLE EN MANCHETTE + 4 DERNIERS LIVRES -->
<section class="pb-16 pt-10 lg:pt-14" style="padding-inline: var(--page-gutter)">
  <div class="grid gap-y-14 lg:grid-cols-2" style="column-gap: var(--page-gutter)">

    <!-- Manchette : le dernier article de L'Antichambre -->
    {#if article}
      <div class="flex flex-col">
        <div class="mb-7 flex items-end justify-between gap-4 border-b-[3px] border-foreground pb-2.5">
          <span class="display-title text-2xl leading-none sm:text-3xl">Antichambre</span>
          <a href="/antichambre" class="link shrink-0 whitespace-nowrap pb-1 font-display text-sm font-medium uppercase tracking-wide">Le magazine →</a>
        </div>

        <!-- Même gabarit que les articles suivants : rubrique en rouge · date,
             puis le titre, puis l'auteur seul — en plus grand. -->
        <div class="flex flex-wrap items-center gap-x-2 font-display text-sm uppercase tracking-wide">
          {#if article.rubrique_name}
            <a href="/antichambre?rubrique={article.rubrique_slug}" class="font-semibold text-link hover:underline">{article.rubrique_name}</a>
            {#if article.published_at}<span class="text-muted-foreground">·</span>{/if}
          {/if}
          {#if article.published_at}<span class="text-muted-foreground">{fmt(article.published_at)}</span>{/if}
        </div>

        <a href="/article/{article.slug}" class="group mt-2 block">
          <h1 class="display-title break-words text-4xl leading-[0.92] group-hover:text-link sm:text-5xl lg:text-[2.25rem] xl:text-5xl">{article.title}</h1>
        </a>

        {#if article.author}
          <p class="mt-2 font-display text-sm uppercase tracking-[0.14em] text-muted-foreground">{article.author}</p>
        {/if}

        {#if lede}
          <p class="mt-5 max-w-prose text-base leading-relaxed text-foreground/80">{lede}</p>
        {/if}

        <a href="/article/{article.slug}" class="link mt-5 inline-flex w-fit items-center gap-2 font-display text-sm font-semibold uppercase tracking-wider">
          Lire l’article <span aria-hidden="true">→</span>
        </a>

        <!-- 3 articles récents (thème · date, titre, auteur) -->
        {#if secondary.length}
          <div class="mt-8 divide-y divide-border border-t-2 border-foreground">
            {#each secondary as a (a.slug)}
              <a href="/article/{a.slug}" class="group block py-3.5">
                <div class="flex flex-wrap items-center gap-x-2 font-display text-xs uppercase tracking-wide">
                  {#if a.rubrique_name}<span class="font-semibold text-link">{a.rubrique_name}</span><span class="text-muted-foreground">·</span>{/if}
                  <span class="text-muted-foreground">{fmt(a.published_at)}</span>
                </div>
                <h3 class="display-title mt-1 text-xl leading-tight group-hover:text-link">{a.title}</h3>
                {#if a.author}<p class="mt-1 font-display text-xs uppercase tracking-wide text-muted-foreground">{a.author}</p>{/if}
                {#if a.excerpt}
                  <p class="mt-1.5 line-clamp-3 text-sm leading-relaxed text-foreground/75">{extraitPropre(a.excerpt)}</p>
                {/if}
              </a>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Vitrine : les 4 derniers livres parus -->
    {#if books.length}
      <div class="flex flex-col {article ? '' : 'lg:col-span-2'}">
        <div class="mb-7 flex items-end justify-between gap-4 border-b-[3px] border-foreground pb-2.5">
          <span class="display-title text-2xl leading-none sm:text-3xl">Nouveautés</span>
          <a href="/catalogue" class="link shrink-0 whitespace-nowrap pb-1 font-display text-sm font-medium uppercase tracking-wide">Le catalogue →</a>
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
                {#if isForthcoming(book)}
                  <span class="absolute left-0 top-0 bg-ink px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-white">À paraître</span>
                {/if}
              </div>
              <div class="mt-3">
                <h3 class="line-clamp-2 font-sans text-base font-bold leading-tight text-foreground transition-colors group-hover:text-link sm:text-[17px]">{book.title}</h3>
                {#if book.subtitle}<p class="mt-px line-clamp-2 text-[13px] leading-snug text-muted-foreground">{book.subtitle}</p>{/if}
                {#if book.authors?.length}<p class="mt-0.5 line-clamp-1 text-[13px] font-semibold tracking-wide text-link transition-colors group-hover:text-foreground">{authorList(book.authors)}</p>{/if}
              </div>
            </a>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</section>

<!-- À PARAÎTRE + FOCUS -->
{#if data.forthcoming.length || data.featured.length}
  <section class="py-14" style="padding-inline: var(--page-gutter)">
    <div class="grid gap-y-12 lg:grid-cols-2" style="column-gap: var(--page-gutter)">
      {#if data.forthcoming.length}
        <div>
          <SectionHead title="À paraître" href="/catalogue?parution=a-paraitre" more="Tous les livres" />
          <div class="grid grid-cols-3 gap-x-5 gap-y-8">
            {#each data.forthcoming.slice(0, 3) as book (book.slug)}<BookCard {book} />{/each}
          </div>
        </div>
      {/if}
      {#if data.featured.length}
        <div>
          <SectionHead title="Focus" href="/catalogue" more="Le catalogue" />
          <div class="grid grid-cols-3 gap-x-5 gap-y-8">
            {#each data.featured.slice(0, 3) as book (book.slug)}<BookCard {book} />{/each}
          </div>
        </div>
      {/if}
    </div>
  </section>
{/if}

<!-- RENCONTRES — carte de France (pastilles) + 6 prochaines rencontres -->
{#if data.events.length}
  <section class="bg-background">
    <div class="py-14" style="padding-inline: var(--page-gutter)">
      <SectionHead title="Rencontres" href="/rencontres" more="L’agenda" />
      <EventsExplorer events={data.events} />
    </div>
  </section>
{/if}
