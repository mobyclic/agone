<script lang="ts">
  import BookCard from '$lib/components/BookCard.svelte';
  import { ArrowLeft } from 'phosphor-svelte';

  let { data } = $props();
</script>

<svelte:head><title>{data.collection.name} · Collection Agone</title></svelte:head>

<section class="border-b border-border bg-sidebar text-sidebar-foreground">
  <div class="mx-auto max-w-7xl px-4 py-12 sm:px-6">
    <a href="/catalogue" class="mb-4 inline-flex items-center gap-1.5 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground">
      <ArrowLeft size={16} /> Catalogue
    </a>
    <p class="eyebrow" style="color:var(--sidebar-primary)">Collection</p>
    <h1 class="mt-1 text-4xl font-extrabold tracking-tight">{data.collection.name}</h1>
    <p class="mt-2 text-sidebar-foreground/70">{data.books.length} ouvrages</p>
  </div>
</section>

<section class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
  <div class="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
    {#each data.books as book (book.slug)}
      <BookCard {book} />
    {/each}
  </div>
</section>
