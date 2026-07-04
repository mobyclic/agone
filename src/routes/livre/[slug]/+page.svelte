<script lang="ts">
  import { ROLE_LABEL, euros } from '$lib/labels';
  import { ArrowLeft } from 'phosphor-svelte';

  let { data } = $props();
  const b = $derived(data.book);
  const pubLabel = $derived(
    b.published_at
      ? new Date(b.published_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
      : null
  );
  const dims = $derived(b.width_cm && b.height_cm ? `${b.width_cm} × ${b.height_cm} cm` : null);
</script>

<svelte:head><title>{b.title} · Agone</title></svelte:head>

<div class="mx-auto max-w-5xl px-4 py-8 sm:px-6">
  <a href="/catalogue" class="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
    <ArrowLeft size={16} /> Retour au catalogue
  </a>

  <div class="grid gap-8 md:grid-cols-[minmax(0,300px)_1fr] lg:gap-12">
    <!-- Colonne couverture + achat -->
    <div>
      <div class="relative aspect-[2/3] overflow-hidden rounded-lg border border-border bg-muted shadow-md">
        {#if b.cover_url}
          <img src={b.cover_url} alt={b.title} class="size-full object-cover" />
        {:else}
          <div class="flex size-full flex-col justify-between bg-gradient-to-br from-sidebar to-brand-blue p-4 text-white">
            <span class="text-[11px] uppercase tracking-[0.2em] opacity-60">Agone</span>
            <span class="text-lg font-semibold leading-tight">{b.title}</span>
          </div>
        {/if}
      </div>

      <!-- Encart achat -->
      <div class="mt-4 rounded-lg border border-border bg-card p-4">
        {#if b.status === 'forthcoming'}
          <p class="mb-2 inline-block rounded bg-accent px-2 py-0.5 text-xs font-semibold text-primary">À paraître{pubLabel ? ` · ${pubLabel}` : ''}</p>
        {/if}
        <div class="space-y-1.5 text-sm">
          {#if euros(b.price_paper)}
            <div class="flex items-baseline justify-between">
              <span class="text-muted-foreground">Papier</span>
              <span class="text-lg font-bold">{euros(b.price_paper)}</span>
            </div>
          {/if}
          {#if euros(b.price_ebook)}
            <div class="flex items-baseline justify-between">
              <span class="text-muted-foreground">Numérique (ePub)</span>
              <span class="font-semibold">{euros(b.price_ebook)}</span>
            </div>
          {/if}
        </div>
        <button
          type="button"
          disabled
          class="btn-brand mt-4 h-11 w-full rounded-md text-sm font-semibold opacity-60"
          title="La vente en ligne sera activée prochainement"
        >
          Ajouter au panier
        </button>
        <p class="mt-2 text-center text-xs text-muted-foreground">Boutique en cours d’activation.</p>
      </div>
    </div>

    <!-- Colonne contenu -->
    <div>
      {#if b.collections?.length}
        <a href="/collections/{b.collections[0].slug}" class="eyebrow hover:underline">{b.collections[0].name}</a>
      {/if}
      <h1 class="mt-1 text-3xl font-extrabold leading-tight tracking-tight">{b.title}</h1>
      {#if b.subtitle}<p class="mt-2 text-lg text-muted-foreground">{b.subtitle}</p>{/if}

      {#if b.contributors?.length}
        <div class="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {#each b.contributors as c (c.role)}
            <span>
              <span class="text-muted-foreground">{ROLE_LABEL[c.role] ?? c.role} :</span>
              {#each c.people as p, i (p.slug)}<a href="/auteur/{p.slug}" class="font-medium text-primary hover:underline">{p.name}</a>{#if i < c.people.length - 1}, {/if}{/each}
            </span>
          {/each}
        </div>
      {/if}

      {#if b.description_html}
        <div class="prose-agone mt-6 max-w-none text-[15px] leading-relaxed [&_a]:text-primary [&_a:hover]:underline [&_p]:mb-3">
          {@html b.description_html}
        </div>
      {/if}

      {#if b.extra_info_html}
        <div class="mt-4 rounded-md bg-secondary/60 p-4 text-sm text-muted-foreground [&_p]:mb-2">
          {@html b.extra_info_html}
        </div>
      {/if}

      <!-- Fiche technique -->
      <dl class="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-6 text-sm sm:grid-cols-3">
        {#if pubLabel}<div><dt class="text-muted-foreground">Parution</dt><dd class="font-medium capitalize">{pubLabel}</dd></div>{/if}
        {#if b.page_count}<div><dt class="text-muted-foreground">Pages</dt><dd class="font-medium">{b.page_count}</dd></div>{/if}
        {#if dims}<div><dt class="text-muted-foreground">Format</dt><dd class="font-medium">{dims}</dd></div>{/if}
        {#if b.isbn_paper}<div><dt class="text-muted-foreground">ISBN</dt><dd class="font-medium">{b.isbn_paper}</dd></div>{/if}
        {#if b.title_original}<div class="col-span-2"><dt class="text-muted-foreground">Titre original</dt><dd class="font-medium">{b.title_original}{b.language_original ? ` (${b.language_original})` : ''}</dd></div>{/if}
      </dl>
    </div>
  </div>
</div>
