<script lang="ts">
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import BookCard from '$lib/components/BookCard.svelte';
  import PageHead from '$lib/components/PageHead.svelte';
  import { PencilSimple } from 'phosphor-svelte';

  let { data } = $props();
  const isStaff = $derived(['admin', 'editor'].includes(page.data.user?.role ?? ''));
  const collectionId = $derived(String(data.collection.id ?? '').replace(/^collection:/, ''));
</script>

<svelte:head><title>{data.collection.name} · Collection Agone</title></svelte:head>

<PageHead eyebrow="Collection" title={data.collection.name} subtitle={data.collection.subtitle || undefined} />

{#if isStaff && collectionId}
  <div class="fixed bottom-6 right-6 z-40">
    <Button href="/admin/collections/{collectionId}" variant="outline" class="bg-background shadow-2xl"><PencilSimple size={16} /> Éditer</Button>
  </div>
{/if}

<section class="py-10" style="padding-inline: var(--page-gutter)">
  <!-- Présentation de la collection, sous le titre. La mise en page « magazine »
       d'avant (grille dense, hauteur du bloc mesurée au ResizeObserver, span de
       rangées calculé, marge négative mordant sur l'en-tête) coûtait une
       quarantaine de lignes de mesure pour un gain douteux : le texte se lit
       maintenant d'abord, les livres suivent. -->
  {#if data.collection.description_html}
    <div class="prose-agone texte-justifie max-w-4xl text-base leading-relaxed text-foreground/90 [&_a]:text-link [&_a:hover]:underline [&_p]:mb-4">
      {@html data.collection.description_html}
    </div>
  {/if}

  <div class="mt-10 grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
    {#each data.books as book (book.slug)}
      <BookCard {book} />
    {/each}
  </div>

  {#if !data.books.length}
    <p class="py-16 text-muted-foreground">Aucun titre dans cette collection pour le moment.</p>
  {/if}
</section>
