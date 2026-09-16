<script lang="ts">
  import { extraitPropre } from '$lib/text';
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

<svelte:head><title>Antichambre · Agone</title></svelte:head>

<PageHead eyebrow={active ? 'Antichambre' : undefined} title={active?.name ?? 'Antichambre'} subtitle={active ? active.subtitle || undefined : 'Réflexions & digressions — au-delà des livres.'} />

<section class="py-10" style="padding-inline: var(--page-gutter)">
  <div class="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-12">
    <!-- Sous-nav rubriques : colonne de gauche (collante en desktop). -->
    <aside class="lg:sticky lg:top-24 lg:self-start">
      <nav class="flex flex-col gap-0.5 font-display">
        <a href="/antichambre" class="flex items-center justify-between border-l-2 px-3 py-2 text-base uppercase tracking-wide {!data.rubrique ? 'border-foreground font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'}">Antichambre</a>
        {#each data.rubriques as r (r.slug)}
          <a href="/antichambre{qs({ rubrique: r.slug, page: undefined })}" class="flex items-center justify-between gap-3 border-l-2 px-3 py-2 text-base uppercase tracking-wide {data.rubrique === r.slug ? 'border-foreground font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'}">
            <span>{r.name}</span><span class="shrink-0 text-sm opacity-60">{r.count}</span>
          </a>
        {/each}
      </nav>
    </aside>

    <!-- Articles -->
    <div class="min-w-0">
      {#if data.articles.length === 0}
        <p class="py-16 text-center text-muted-foreground">Aucun article.</p>
      {:else}
        <!-- Même gabarit que la liste de l'accueil : rubrique · date, titre,
             auteur, début du texte. Mesure de lecture bornée : la page est en
             pleine largeur, une ligne de 1200 px serait illisible. -->
        <div class="max-w-4xl divide-y divide-border border-t-2 border-foreground">
          {#each data.articles as a (a.slug)}
            <a href="/article/{a.slug}" class="group block py-4">
              <div class="flex flex-wrap items-center gap-x-2 font-display text-xs uppercase tracking-wide">
                {#if a.rubrique_name}<span class="font-semibold text-link">{a.rubrique_name}</span><span class="text-muted-foreground">·</span>{/if}
                <span class="text-muted-foreground">{fmt(a.published_at)}</span>
              </div>
              <h2 class="display-title mt-1 text-xl leading-tight group-hover:text-link">{a.title}</h2>
              {#if a.author}<p class="mt-0.5 font-display text-xs uppercase tracking-wide text-muted-foreground">{a.author}</p>{/if}
              {#if a.excerpt}<p class="mt-1.5 line-clamp-3 text-sm leading-relaxed text-foreground/75">{extraitPropre(a.excerpt)}</p>{/if}
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
