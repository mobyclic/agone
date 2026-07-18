<script lang="ts">
  import BookCard from '$lib/components/BookCard.svelte';
  import PageHead from '$lib/components/PageHead.svelte';

  let { data } = $props();
</script>

<svelte:head><title>{data.collection.name} · Collection Agone</title></svelte:head>

<PageHead eyebrow="Catalogue" title={data.collection.name} />

<section class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
  <!-- Grille magazine : les couvertures s'agencent autour du bloc description (grid dense). -->
  <div class="grid grid-flow-row-dense grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
    {#if data.collection.description_html}
      <div class="prose-agone col-span-2 self-start bg-secondary p-6 text-[15px] leading-relaxed text-foreground/90 sm:col-span-3 md:col-span-4 lg:col-span-2 lg:col-start-4 lg:row-span-3 [&_a]:text-link [&_p]:mb-3">
        {@html data.collection.description_html}
      </div>
    {/if}
    {#each data.books as book (book.slug)}
      <BookCard {book} />
    {/each}
  </div>
</section>
