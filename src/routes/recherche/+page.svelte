<script lang="ts">
  import BookCard from '$lib/components/BookCard.svelte';
  import { MagnifyingGlass } from 'phosphor-svelte';
  let { data } = $props();
  const nothing = $derived(data.q && !data.books.length && !data.authors.length && !data.articles.length);
</script>

<svelte:head><title>Recherche · Agone</title></svelte:head>

<div class="mx-auto max-w-6xl px-4 py-10 sm:px-6">
  <form method="GET" class="relative max-w-2xl">
    <MagnifyingGlass size={20} class="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input
      name="q"
      value={data.q}
      placeholder="Rechercher un livre, un auteur, un article…"
      class="h-12 w-full rounded-lg border border-border bg-background pl-11 pr-4 text-base outline-none focus:border-primary"
    />
  </form>

  {#if data.q}
    {#if nothing}
      <p class="py-16 text-center text-muted-foreground">Aucun résultat pour « {data.q} ».</p>
    {/if}

    {#if data.books.length}
      <section class="mt-10">
        <h2 class="text-lg font-bold">Livres</h2>
        <div class="mt-4 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {#each data.books as book (book.slug)}<BookCard {book} />{/each}
        </div>
      </section>
    {/if}

    {#if data.authors.length}
      <section class="mt-10">
        <h2 class="text-lg font-bold">Auteurs</h2>
        <div class="mt-4 flex flex-wrap gap-2">
          {#each data.authors as a (a.slug)}
            <a href="/auteur/{a.slug}" class="rounded-full border border-border px-3 py-1.5 text-sm font-medium hover:border-primary hover:text-link">{a.full_name}</a>
          {/each}
        </div>
      </section>
    {/if}

    {#if data.articles.length}
      <section class="mt-10">
        <h2 class="text-lg font-bold">L’Antichambre</h2>
        <ul class="mt-4 divide-y divide-border border-y border-border">
          {#each data.articles as a (a.slug)}
            <li><a href="/article/{a.slug}" class="block py-3 font-medium hover:text-link">{a.title}</a></li>
          {/each}
        </ul>
      </section>
    {/if}
  {:else}
    <p class="mt-8 text-muted-foreground">Saisissez un terme pour rechercher dans le catalogue, les auteurs et les articles.</p>
  {/if}
</div>
