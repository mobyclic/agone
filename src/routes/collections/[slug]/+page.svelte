<script lang="ts">
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import BookCard from '$lib/components/BookCard.svelte';
  import PageHead from '$lib/components/PageHead.svelte';
  import { PencilSimple } from 'phosphor-svelte';

  let { data } = $props();
  const isStaff = $derived(['admin', 'editor'].includes(page.data.user?.role ?? ''));
  const collectionId = $derived(String(data.collection.id ?? '').replace(/^collection:/, ''));

  // Le bloc description « mord » sur l'en-tête noir et se cale à droite.
  // On mesure sa hauteur réelle pour lui réserver juste le bon nombre de
  // rangées de la grille → les couvertures remontent pile en dessous (dense-flow).
  // `items-start` garde la hauteur naturelle des cartes : la mesure ne dépend
  // donc pas du span calculé (pas de boucle de rétroaction).
  let descEl = $state<HTMLElement>();
  let gridEl = $state<HTMLElement>();
  let descSpan = $state(2);

  function recompute() {
    if (!descEl || !gridEl) return;
    // En dessous de lg, le bloc est pleine largeur en tête : une seule rangée.
    if (window.innerWidth < 1024) { descSpan = 1; return; }
    const rowGap = parseFloat(getComputedStyle(gridEl).rowGap) || 0;
    // Unité de rangée = la plus petite couverture (biais sûr → plutôt sur-réserver).
    const cards = Array.from(gridEl.children).filter((c) => c !== descEl) as HTMLElement[];
    const cardH = cards.length ? Math.min(...cards.slice(0, 6).map((c) => c.offsetHeight)) : 300;
    const rowUnit = cardH + rowGap;
    if (rowUnit < 100) return; // garde-fou : mesure pas encore stabilisée
    // marge négative (mord sur le noir) = espace hors grille à retrancher
    const mt = parseFloat(getComputedStyle(descEl).marginTop) || 0;
    const occupied = descEl.offsetHeight + mt;
    descSpan = Math.min(8, Math.max(1, Math.ceil(occupied / rowUnit)));
  }

  $effect(() => {
    if (!descEl || !gridEl) return;
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(descEl);
    ro.observe(gridEl);
    window.addEventListener('resize', recompute);
    return () => { ro.disconnect(); window.removeEventListener('resize', recompute); };
  });
</script>

<svelte:head><title>{data.collection.name} · Collection Agone</title></svelte:head>

<PageHead eyebrow="Catalogue" title={data.collection.name} />

{#if isStaff && collectionId}
  <div class="fixed bottom-6 right-6 z-40">
    <Button href="/admin/collections/{collectionId}" variant="outline" class="bg-background shadow-2xl"><PencilSimple size={16} /> Éditer</Button>
  </div>
{/if}

<section class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
  <!-- Grille magazine : les couvertures s'agencent autour du bloc description (grid dense). -->
  <div bind:this={gridEl} class="grid grid-flow-row-dense grid-cols-2 items-start gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
    {#if data.collection.description_html}
      <div
        bind:this={descEl}
        style="grid-row: span {descSpan}"
        class="prose-agone col-span-2 self-start bg-secondary p-6 text-[15px] leading-relaxed text-foreground/90 sm:col-span-3 md:col-span-4 lg:relative lg:z-10 lg:col-span-2 lg:col-start-5 lg:-mt-28 [&_a]:text-link [&_p]:mb-3"
      >
        {@html data.collection.description_html}
      </div>
    {/if}
    {#each data.books as book (book.slug)}
      <BookCard {book} />
    {/each}
  </div>
</section>
