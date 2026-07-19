<script lang="ts">
  import PageHead from '$lib/components/PageHead.svelte';
  let { data } = $props();
  const pageCount = $derived(Math.max(1, Math.ceil(data.total / data.limit)));
  const active = $derived(data.rubriques.find((r) => r.slug === data.rubrique));
  const fmt = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  function qs(p: Record<string, string | number | undefined>) {
    const sp = new URLSearchParams();
    const merged = { rubrique: data.rubrique, q: data.q, ...p };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== '') sp.set(k, String(v));
    const s = sp.toString();
    return s ? `?${s}` : '';
  }
</script>

<svelte:head><title>L’Antichambre · Agone</title></svelte:head>

<PageHead eyebrow={active ? 'Antichambre' : undefined} title={active?.name ?? 'Antichambre'} subtitle={active ? undefined : 'Textes, inactualités et critiques — au-delà des livres.'} />

<section class="mx-auto max-w-6xl px-4 py-10 sm:px-6">
  <div class="grid gap-8 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-12">
    <!-- Sous-nav rubriques : colonne de gauche (collante en desktop). -->
    <aside class="lg:sticky lg:top-24 lg:self-start">
      <nav class="flex flex-col gap-0.5 font-display">
        <a href="/antichambre" class="flex items-center justify-between border-l-2 px-3 py-1.5 text-sm uppercase tracking-wide {!data.rubrique ? 'border-foreground font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'}">Antichambre</a>
        {#each data.rubriques as r (r.slug)}
          <a href="/antichambre{qs({ rubrique: r.slug, page: undefined })}" class="flex items-center justify-between gap-2 border-l-2 px-3 py-1.5 text-sm uppercase tracking-wide {data.rubrique === r.slug ? 'border-foreground font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'}">
            <span>{r.name}</span><span class="text-xs opacity-60">{r.count}</span>
          </a>
        {/each}
      </nav>
    </aside>

    <!-- Articles -->
    <div class="min-w-0">
      {#if data.articles.length === 0}
        <p class="py-16 text-center text-muted-foreground">Aucun article.</p>
      {:else}
        <div class="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
          {#each data.articles as a (a.slug)}
            <a href="/article/{a.slug}" class="group flex flex-col">
              {#if a.cover_url}
                <div class="mb-3 aspect-[16/10] overflow-hidden rounded-lg border border-border bg-muted">
                  <img src={a.cover_url} alt="" loading="lazy" class="size-full object-cover transition-transform group-hover:scale-[1.03]" />
                </div>
              {/if}
              {#if a.rubrique_name}<span class="eyebrow">{a.rubrique_name}</span>{/if}
              <h2 class="mt-1 line-clamp-2 font-semibold leading-snug group-hover:text-link">{a.title}</h2>
              {#if a.excerpt}<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">{a.excerpt}</p>{/if}
              <span class="mt-2 text-xs text-muted-foreground">{fmt(a.published_at)}</span>
            </a>
          {/each}
        </div>

        {#if pageCount > 1}
          <div class="mt-12 flex items-center justify-center gap-2 text-sm">
            {#if data.page > 1}<a href="/antichambre{qs({ page: data.page - 1 })}" class="rounded-md border border-border px-3 py-2 hover:bg-muted">← Précédent</a>{/if}
            <span class="px-3 py-2 text-muted-foreground">Page {data.page} / {pageCount}</span>
            {#if data.page < pageCount}<a href="/antichambre{qs({ page: data.page + 1 })}" class="rounded-md border border-border px-3 py-2 hover:bg-muted">Suivant →</a>{/if}
          </div>
        {/if}
      {/if}
    </div>
  </div>
</section>
