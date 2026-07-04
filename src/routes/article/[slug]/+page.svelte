<script lang="ts">
  import { ArrowLeft } from 'phosphor-svelte';
  let { data } = $props();
  const a = $derived(data.article);
  const fmt = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
</script>

<svelte:head><title>{a.title} · L’Antichambre — Agone</title></svelte:head>

<article class="mx-auto max-w-3xl px-4 py-10 sm:px-6">
  <a href="/antichambre" class="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
    <ArrowLeft size={16} /> L’Antichambre
  </a>

  {#if a.rubrique_name}
    <a href="/antichambre?rubrique={a.rubrique_slug}" class="eyebrow hover:underline">{a.rubrique_name}</a>
  {/if}
  <h1 class="mt-2 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{a.title}</h1>
  <div class="mt-3 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
    <span>{fmt(a.published_at)}</span>
    {#if a.authors.length}
      <span>·</span>
      <span>{#each a.authors as au, i (au.slug)}<a href="/auteur/{au.slug}" class="text-link hover:underline">{au.full_name}</a>{#if i < a.authors.length - 1}, {/if}{/each}</span>
    {/if}
  </div>

  {#if a.cover_url}
    <img src={a.cover_url} alt="" class="mt-6 w-full rounded-lg border border-border" />
  {/if}

  {#if a.body_html}
    <div class="prose-agone mt-8 max-w-none text-[16px] leading-relaxed [&_a]:text-link [&_a:hover]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:font-bold [&_img]:my-4 [&_img]:rounded-lg [&_p]:mb-4">
      {@html a.body_html}
    </div>
  {/if}

  {#if a.books.length}
    <div class="mt-10 rounded-lg border border-border bg-secondary/40 p-4">
      <h2 class="eyebrow mb-2">Livres liés</h2>
      <ul class="space-y-1">
        {#each a.books as b (b.slug)}<li><a href="/livre/{b.slug}" class="font-medium text-link hover:underline">{b.title}</a></li>{/each}
      </ul>
    </div>
  {/if}
</article>
