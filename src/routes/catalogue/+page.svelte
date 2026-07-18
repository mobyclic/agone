<script lang="ts">
  import BookCard from '$lib/components/BookCard.svelte';
  import PageHead from '$lib/components/PageHead.svelte';
  import { MagnifyingGlass } from 'phosphor-svelte';

  let { data } = $props();
  const pageCount = $derived(Math.max(1, Math.ceil(data.total / data.limit)));

  function qs(params: Record<string, string | number | undefined>) {
    const sp = new URLSearchParams();
    const merged = { q: data.q, collection: data.collection, sort: data.sort, ...params };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== '' && v !== 'recent') sp.set(k, String(v));
    const s = sp.toString();
    return s ? `?${s}` : '';
  }
</script>

<svelte:head><title>Catalogue · Agone</title></svelte:head>

<PageHead title="Le catalogue" meta="{data.total} ouvrages" />

<section class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
  <form method="GET" class="flex flex-wrap items-center gap-3">
    <div class="relative min-w-[220px] flex-1">
      <MagnifyingGlass size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input name="q" value={data.q ?? ''} placeholder="Rechercher un titre…"
        class="h-11 w-full border border-border bg-background pl-10 pr-3 text-sm outline-none focus:border-foreground" />
    </div>
    {#if data.collection}<input type="hidden" name="collection" value={data.collection} />{/if}
    <select name="sort" class="h-11 border border-border bg-background px-3 text-sm outline-none focus:border-foreground">
      <option value="recent" selected={data.sort === 'recent'}>Plus récents</option>
      <option value="title" selected={data.sort === 'title'}>Titre A–Z</option>
      <option value="price_asc" selected={data.sort === 'price_asc'}>Prix croissant</option>
    </select>
    <button type="submit" class="btn-brand h-11 px-5 font-display text-sm font-medium uppercase tracking-wide">Filtrer</button>
  </form>

  {#if data.books.length === 0}
    <p class="py-16 text-center text-muted-foreground">Aucun livre ne correspond à votre recherche.</p>
  {:else}
    <div class="mt-8 grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {#each data.books as book (book.slug)}<BookCard {book} />{/each}
    </div>

    {#if pageCount > 1}
      <div class="mt-12 flex items-center justify-center gap-2 text-sm">
        {#if data.page > 1}<a href="/catalogue{qs({ page: data.page - 1 })}" class="border border-border px-3 py-2 hover:bg-muted">← Précédent</a>{/if}
        <span class="px-3 py-2 text-muted-foreground">Page {data.page} / {pageCount}</span>
        {#if data.page < pageCount}<a href="/catalogue{qs({ page: data.page + 1 })}" class="border border-border px-3 py-2 hover:bg-muted">Suivant →</a>{/if}
      </div>
    {/if}
  {/if}
</section>
