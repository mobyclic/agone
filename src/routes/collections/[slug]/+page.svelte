<script lang="ts">
  import BookCard from '$lib/components/BookCard.svelte';
  import PageHead from '$lib/components/PageHead.svelte';

  let { data } = $props();
</script>

<svelte:head><title>{data.collection.name} · Collection Agone</title></svelte:head>

<PageHead eyebrow="Catalogue" title={data.collection.name} meta="{data.books.length} ouvrages" />

{#if data.collection.description_html}
  <section class="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
    <div class="prose-agone text-base leading-relaxed text-foreground/85">{@html data.collection.description_html}</div>
  </section>
{/if}

<section class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
  <div class="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
    {#each data.books as book (book.slug)}
      <BookCard {book} />
    {/each}
  </div>
</section>
