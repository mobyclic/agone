<script lang="ts">
  import BookCard from '$lib/components/BookCard.svelte';
  import PageHead from '$lib/components/PageHead.svelte';

  let { data } = $props();
  const a = $derived(data.author);
  const years = $derived(
    a.birth_year || a.death_year ? `${a.birth_year ?? ''}–${a.death_year ?? ''}` : null
  );
</script>

<svelte:head><title>{a.full_name} · Agone</title></svelte:head>

<PageHead eyebrow="Auteur·rice" title={a.full_name} meta={[a.nationality, years].filter(Boolean).join(' · ') || undefined} />

<div class="mx-auto max-w-5xl px-4 py-10 sm:px-6">
  <header class="flex flex-col gap-6 sm:flex-row sm:items-start">
    <div class="size-28 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
      {#if a.portrait_url}
        <img src={a.portrait_url} alt={a.full_name} class="size-full object-cover" />
      {:else}
        <div class="grid size-full place-items-center bg-gradient-to-br from-sidebar to-brand-blue text-2xl font-bold text-white">
          {a.full_name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
        </div>
      {/if}
    </div>
    <div>
      {#if a.bio_html}
        <div class="prose-agone mt-4 max-w-2xl text-[15px] leading-relaxed text-foreground/90 [&_a]:text-link [&_p]:mb-3">
          {@html a.bio_html}
        </div>
      {/if}
      {#if a.website}
        <a href={a.website} target="_blank" rel="noopener" class="mt-2 inline-block text-sm font-medium text-link hover:underline">Site web →</a>
      {/if}
    </div>
  </header>

  {#each a.works as group (group.role)}
    <section class="mt-12">
      <h2 class="eyebrow mb-4 border-b border-border pb-2">{group.role_label}{group.books.length > 1 ? ` · ${group.books.length} titres` : ''}</h2>
      <div class="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {#each group.books as book (book.slug)}
          <BookCard {book} />
        {/each}
      </div>
    </section>
  {/each}
</div>
