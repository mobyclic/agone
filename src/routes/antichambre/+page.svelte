<script lang="ts">
  let { data } = $props();
  const pageCount = $derived(Math.max(1, Math.ceil(data.total / data.limit)));
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

<section class="border-b border-border bg-sidebar text-sidebar-foreground">
  <div class="mx-auto max-w-6xl px-4 py-12 sm:px-6">
    <p class="eyebrow" style="color:var(--sidebar-primary)">Le magazine</p>
    <h1 class="mt-1 text-4xl font-extrabold tracking-tight">L’Antichambre</h1>
    <p class="mt-2 max-w-xl text-sidebar-foreground/70">Textes, inactualités et critiques — au-delà des livres.</p>
    <div class="mt-6 flex flex-wrap gap-2">
      <a href="/antichambre" class="rounded-full border px-3 py-1 text-xs font-medium {!data.rubrique ? 'border-sidebar-primary bg-sidebar-primary text-sidebar-primary-foreground' : 'border-sidebar-border text-sidebar-foreground/70 hover:bg-sidebar-accent'}">Tout</a>
      {#each data.rubriques as r (r.slug)}
        <a href="/antichambre{qs({ rubrique: r.slug, page: undefined })}" class="rounded-full border px-3 py-1 text-xs font-medium {data.rubrique === r.slug ? 'border-sidebar-primary bg-sidebar-primary text-sidebar-primary-foreground' : 'border-sidebar-border text-sidebar-foreground/70 hover:bg-sidebar-accent'}">{r.name} <span class="opacity-60">{r.count}</span></a>
      {/each}
    </div>
  </div>
</section>

<section class="mx-auto max-w-6xl px-4 py-10 sm:px-6">
  {#if data.articles.length === 0}
    <p class="py-16 text-center text-muted-foreground">Aucun article.</p>
  {:else}
    <div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
      {#each data.articles as a (a.slug)}
        <a href="/article/{a.slug}" class="group flex flex-col">
          {#if a.cover_url}
            <div class="mb-3 aspect-[16/10] overflow-hidden rounded-lg border border-border bg-muted">
              <img src={a.cover_url} alt="" loading="lazy" class="size-full object-cover transition-transform group-hover:scale-[1.03]" />
            </div>
          {/if}
          {#if a.rubrique_name}<span class="eyebrow">{a.rubrique_name}</span>{/if}
          <h2 class="mt-1 line-clamp-2 font-semibold leading-snug group-hover:text-primary">{a.title}</h2>
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
</section>
