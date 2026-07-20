<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import PageHead from '$lib/components/PageHead.svelte';
  import { Eye, PencilSimple } from 'phosphor-svelte';
  let { data } = $props();
  const a = $derived(data.article);
  const isStaff = $derived(['admin', 'editor'].includes(page.data.user?.role ?? ''));
  const fmt = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

  // Comptage d'une vue (une fois, côté client).
  onMount(() => {
    fetch(`/article/${a.slug}/vue`, { method: 'POST', keepalive: true }).catch(() => {});
  });
</script>

<svelte:head><title>{a.title} · L’Antichambre — Agone</title></svelte:head>

<PageHead
  eyebrow={a.rubrique_name ? `Antichambre / ${a.rubrique_name}` : 'Antichambre'}
  title={a.title}
  width="max-w-7xl"
  inner={data.books.length ? 'lg:max-w-[calc(100%_-_400px)]' : 'max-w-4xl'}
>
  <!-- Date & auteur, juste sous le titre, en petit (minuscules). -->
  <div class="mt-4 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
    <span>{fmt(a.published_at)}</span>
    {#if a.authors.length}
      <span>·</span>
      <span>{#each a.authors as au, i (au.slug)}<a href="/auteur/{au.slug}" class="text-link hover:underline">{au.full_name}</a>{#if i < a.authors.length - 1}, {/if}{/each}</span>
    {/if}
    {#if isStaff && a.views > 0}
      <span>·</span>
      <span class="inline-flex items-center gap-1" title="Nombre de vues (visible admin uniquement)"><Eye size={14} /> {a.views.toLocaleString('fr-FR')}</span>
    {/if}
  </div>
</PageHead>

{#if isStaff}
  <div class="fixed bottom-6 right-6 z-40">
    <Button href="/admin/articles/{a.id}" variant="outline" class="bg-background shadow-2xl"><PencilSimple size={16} /> Éditer</Button>
  </div>
{/if}

<div class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
  <div class="grid gap-10 lg:items-start {data.books.length ? 'lg:grid-cols-[minmax(0,1fr)_360px]' : ''}">
    <article class="min-w-0 {data.books.length ? '' : 'max-w-4xl'}">
  {#if a.cover_url}
    <img src={a.cover_url} alt="" class="mt-6 w-full rounded-lg border border-border" />
  {/if}

  {#if a.body_html}
    <div class="prose-agone mt-8 max-w-none text-[16px] leading-relaxed [&_a]:text-link [&_a:hover]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:font-bold [&_img]:my-4 [&_img]:rounded-lg [&_p]:mb-4">
      {@html a.body_html}
    </div>
  {/if}

    </article>

    {#if data.books.length}
      <aside class="lg:sticky lg:top-28">
        <h2 class="eyebrow mb-4">{data.books.length > 1 ? 'Livres liés' : 'Livre lié'}</h2>
        <div class="space-y-6">
          {#each data.books as book (book.slug)}
            <a href="/livre/{book.slug}" class="group flex gap-4">
              <span class="aspect-[2/3] w-32 shrink-0 overflow-hidden border border-border bg-muted">
                {#if book.cover_url}<img src={book.cover_url} alt="" loading="lazy" class="size-full object-cover" />{/if}
              </span>
              <span class="min-w-0">
                <span class="line-clamp-3 font-display text-base font-medium uppercase leading-tight group-hover:text-link">{book.title}</span>
                {#if book.authors?.length}<span class="mt-1 block text-sm text-link">{book.authors[0].name}</span>{/if}
              </span>
            </a>
          {/each}
        </div>
      </aside>
    {/if}
  </div>
</div>
