<script lang="ts">
  import BookCard from '$lib/components/BookCard.svelte';
  import PageHead from '$lib/components/PageHead.svelte';
  import { MagnifyingGlass, ArrowRight } from 'phosphor-svelte';

  let { data } = $props();
  const pageCount = $derived(data.mode === 'search' ? Math.max(1, Math.ceil(data.total / data.limit)) : 1);

  function searchQs(page?: number) {
    const sp = new URLSearchParams();
    if (data.q) sp.set('q', data.q);
    if (data.mode === 'search' && data.sort && data.sort !== 'recent') sp.set('sort', data.sort);
    if (page && page > 1) sp.set('page', String(page));
    const s = sp.toString();
    return s ? `?${s}` : '';
  }
</script>

<svelte:head><title>Catalogue · Agone</title></svelte:head>

<PageHead title="Le catalogue" />

<section class="mx-auto max-w-7xl px-4 pt-8 sm:px-6">
  <form method="GET" class="flex flex-wrap items-center gap-3">
    <div class="relative min-w-[220px] flex-1">
      <MagnifyingGlass size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input name="q" value={data.q ?? ''} placeholder="Rechercher un titre…"
        class="h-11 w-full border border-border bg-background pl-10 pr-3 text-sm outline-none focus:border-foreground" />
    </div>
    <button type="submit" class="btn-brand h-11 px-5 font-display text-sm font-medium uppercase tracking-wide">Rechercher</button>
    {#if data.mode === 'search'}<a href="/catalogue" class="link h-11 self-center font-display text-sm uppercase tracking-wide">← Collections</a>{/if}
  </form>
</section>

{#if data.mode === 'search'}
  <!-- Résultats de recherche -->
  <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
    {#if data.books.length === 0}
      <p class="py-16 text-center text-muted-foreground">Aucun livre ne correspond à votre recherche.</p>
    {:else}
      <p class="mb-6 text-sm text-muted-foreground">{data.total} résultat{data.total > 1 ? 's' : ''} pour « {data.q} »</p>
      <div class="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {#each data.books as book (book.slug)}<BookCard {book} />{/each}
      </div>
      {#if pageCount > 1}
        <div class="mt-12 flex items-center justify-center gap-2 text-sm">
          {#if data.page > 1}<a href="/catalogue{searchQs(data.page - 1)}" class="border border-border px-3 py-2 hover:bg-muted">← Précédent</a>{/if}
          <span class="px-3 py-2 text-muted-foreground">Page {data.page} / {pageCount}</span>
          {#if data.page < pageCount}<a href="/catalogue{searchQs(data.page + 1)}" class="border border-border px-3 py-2 hover:bg-muted">Suivant →</a>{/if}
        </div>
      {/if}
    {/if}
  </section>
{:else}
  <!-- Vitrine par collections -->
  <div class="mx-auto max-w-7xl px-4 sm:px-6">
    {#each data.collections as c, i (c.slug)}
      <section class="border-t border-border py-12 first:border-t-0">
        <div class="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
          <!-- Texte -->
          <div class={i % 2 === 1 ? 'lg:order-2' : ''}>
            <a href="/collections/{c.slug}" class="group inline-block">
              <h2 class="display-title text-3xl leading-none group-hover:text-link sm:text-4xl lg:text-5xl">{c.name}</h2>
            </a>
            {#if c.description_html}
              <div class="prose-agone mt-4 line-clamp-5 max-w-prose text-[15px] leading-relaxed text-muted-foreground">{@html c.description_html}</div>
            {/if}
            <a href="/collections/{c.slug}" class="link mt-5 inline-flex items-center gap-1.5 font-display text-sm font-semibold uppercase tracking-wide">
              Les {c.book_count} titres <ArrowRight size={15} />
            </a>
          </div>
          <!-- Couvertures -->
          <div class={i % 2 === 1 ? 'lg:order-1' : ''}>
            <div class="grid grid-cols-3 gap-3 sm:gap-4">
              {#each c.books.slice(0, 6) as book (book.slug)}
                <a href="/livre/{book.slug}" class="group block">
                  <div class="aspect-[2/3] overflow-hidden border border-border bg-secondary/40 transition-colors group-hover:border-foreground">
                    {#if book.cover_url}
                      <img src={book.cover_url} alt={book.title} loading="lazy" class="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                    {:else}
                      <div class="flex size-full items-end bg-ink p-1.5 text-white"><span class="line-clamp-4 font-display text-[10px] font-semibold uppercase leading-tight">{book.title}</span></div>
                    {/if}
                  </div>
                </a>
              {/each}
            </div>
          </div>
        </div>
      </section>
    {/each}
  </div>
{/if}
