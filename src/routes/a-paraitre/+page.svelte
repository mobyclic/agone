<script lang="ts">
  import BookCard from '$lib/components/BookCard.svelte';
  let { data } = $props();
</script>

<svelte:head><title>À paraître · Agone</title></svelte:head>

<section class="border-b border-border bg-secondary/40">
  <div class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
    <p class="eyebrow">Prochainement</p>
    <h1 class="mt-1 text-3xl font-extrabold tracking-tight">À paraître</h1>
    <p class="mt-2 text-muted-foreground">{data.books.length} titres en préparation.</p>
  </div>
</section>

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
