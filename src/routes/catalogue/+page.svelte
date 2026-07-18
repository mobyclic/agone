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
    {#each data.collections as c (c.slug)}
      <section class="border-t border-border py-10 first:border-t-0">
        <div class="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div class="min-w-0">
            <a href="/collections/{c.slug}" class="group inline-block">
              <h2 class="display-title text-2xl leading-none group-hover:text-link sm:text-3xl">{c.name}</h2>
            </a>
            {#if c.description_html}
              <div class="prose-agone mt-2.5 line-clamp-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{@html c.description_html}</div>
            {/if}
          </div>
          <a href="/collections/{c.slug}" class="link inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap font-display text-sm font-semibold uppercase tracking-wide">
            Les {c.book_count} titres <ArrowRight size={15} />
          </a>
        </div>
        <div class="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {#each c.books as book (book.slug)}<BookCard {book} />{/each}
        </div>
      </section>
    {/each}
  </div>
{/if}
