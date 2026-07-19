<script lang="ts">
  import BookCard from '$lib/components/BookCard.svelte';
  import PageHead from '$lib/components/PageHead.svelte';
  let { data } = $props();
</script>

<svelte:head><title>À paraître · Agone</title></svelte:head>

<PageHead eyebrow="Catalogue" title="À paraître" subtitle="Les prochains titres des Éditions Agone." />

<section class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
  {#if data.books.length === 0}
    <p class="py-16 text-center text-muted-foreground">Aucun titre à paraître pour le moment.</p>
  {:else}
    <div class="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {#each data.books as book (book.slug)}
        <BookCard {book} />
      {/each}
    </div>
  {/if}
</section>
