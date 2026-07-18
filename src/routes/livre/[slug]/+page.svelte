<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import Lightbox from '$lib/components/Lightbox.svelte';
  import { ROLE_LABEL, euros, isForthcoming } from '$lib/labels';
  import { ArrowLeft, BookOpen, FileText, HandCoins, PencilSimple, MagnifyingGlassPlus } from 'phosphor-svelte';

  let { data } = $props();
  const b = $derived(data.book);
  const images = $derived([b.cover_url, ...(b.gallery ?? [])].filter(Boolean) as string[]);
  let lbOpen = $state(false);
  let lbIndex = $state(0);
  const openLightbox = (i = 0) => { lbIndex = i; lbOpen = true; };
  const isStaff = $derived(['admin', 'editor'].includes(page.data.user?.role ?? ''));
  const bookId = $derived(String(b.id).replace(/^book:/, ''));

  const formats = $derived(
    [
      b.price_paper != null ? { key: 'papier', label: 'Papier', price: b.price_paper } : null,
      b.price_ebook != null ? { key: 'epub', label: 'ePub', price: b.price_ebook } : null,
      b.subscription_price != null && isForthcoming(b)
        ? { key: 'souscription', label: 'Souscription', price: b.subscription_price }
        : null
    ].filter((x): x is { key: string; label: string; price: number } => x !== null)
  );

  const mainAuthors = $derived((b.contributors ?? []).find((c: any) => c.role === 'author')?.people ?? []);
  const otherContributors = $derived((b.contributors ?? []).filter((c: any) => c.role !== 'author'));

  const pubFull = $derived(b.published_at ? new Date(b.published_at).toLocaleDateString('fr-FR') : null);
  const pubLabel = $derived(b.published_at ? new Date(b.published_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : null);
  const dims = $derived(b.width_cm && b.height_cm ? `${b.width_cm} × ${b.height_cm} cm` : null);
  const collection = $derived(b.collections?.[0]);
</script>

<svelte:head><title>{b.title} · Agone</title></svelte:head>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
  <a href="/catalogue" class="mb-6 inline-flex items-center gap-1.5 font-display text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground">
    <ArrowLeft size={14} /> Catalogue
  </a>

  {#if isStaff}
    <div class="fixed bottom-6 right-6 z-40">
      <Button href="/admin/catalogue/{bookId}" variant="outline" class="bg-background shadow-2xl"><PencilSimple size={16} /> Éditer</Button>
    </div>
  {/if}

  <div class="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)_240px] lg:gap-10">
    <!-- Couverture + infos annexes -->
    <div>
      {#if b.cover_url}
        <button type="button" onclick={() => openLightbox(0)} class="group block w-full cursor-zoom-in" aria-label="Agrandir la couverture">
          <div class="relative aspect-[2/3] overflow-hidden border border-border bg-secondary/40">
            <img src={b.cover_url} alt={b.title} class="size-full object-cover" />
            <span class="absolute right-2 top-2 grid size-8 place-items-center bg-background/85 text-foreground opacity-0 transition-opacity group-hover:opacity-100"><MagnifyingGlassPlus size={16} /></span>
          </div>
        </button>
      {:else}
        <div class="relative aspect-[2/3] overflow-hidden border border-border bg-ink">
          <div class="flex size-full items-end p-4"><span class="font-display text-lg uppercase leading-tight text-white">{b.title}</span></div>
        </div>
      {/if}

      <dl class="mt-6 space-y-3 border-t-2 border-foreground pt-5 text-sm">
        {#if pubLabel}<div class="flex justify-between gap-3"><dt class="text-muted-foreground">Parution</dt><dd class="text-right font-medium capitalize">{pubLabel}</dd></div>{/if}
        {#if b.page_count}<div class="flex justify-between gap-3"><dt class="text-muted-foreground">Pages</dt><dd class="font-medium">{b.page_count}</dd></div>{/if}
        {#if dims}<div class="flex justify-between gap-3"><dt class="text-muted-foreground">Format</dt><dd class="font-medium">{dims}</dd></div>{/if}
        {#if b.isbn_paper}<div class="flex justify-between gap-3"><dt class="text-muted-foreground">ISBN</dt><dd class="font-mono text-xs font-medium">{b.isbn_paper}</dd></div>{/if}
        {#if b.title_original}<div><dt class="text-muted-foreground">Titre original</dt><dd class="mt-0.5 font-medium">{b.title_original}{b.language_original ? ` (${b.language_original})` : ''}</dd></div>{/if}
      </dl>
    </div>

    <!-- Contenu -->
    <div class="min-w-0">
      {#if collection}
        <a href="/collections/{collection.slug}" class="eyebrow inline-block hover:text-link">{collection.name}</a>
      {/if}

      <h1 class="display-title mt-2 text-4xl leading-[0.95] sm:text-5xl">{b.title}</h1>
      {#if b.subtitle}<p class="mt-3 text-lg text-muted-foreground">{b.subtitle}</p>{/if}

      <!-- Auteur principal : proche du titre, plus gros -->
      {#if mainAuthors.length}
        <p class="mt-3 font-display text-xl font-semibold uppercase tracking-wide sm:text-2xl">
          {#each mainAuthors as p, i (p.slug)}<a href="/auteur/{p.slug}" class="link">{p.name}</a>{#if i < mainAuthors.length - 1}<span>, </span>{/if}{/each}
        </p>
      {/if}

      <!-- Autres contributeurs -->
      {#if otherContributors.length}
        <div class="mt-2 space-y-0.5">
          {#each otherContributors as c (c.role)}
            <p class="font-display text-sm">
              <span class="text-muted-foreground">{ROLE_LABEL[c.role] ?? c.role} : </span>{#each c.people as p, i (p.slug)}<a href="/auteur/{p.slug}" class="link font-semibold uppercase tracking-wide">{p.name}</a>{#if i < c.people.length - 1}<span>, </span>{/if}{/each}
            </p>
          {/each}
        </div>
      {/if}

      <!-- Boutons d'achat par format -->
      {#if formats.length}
        <div class="mt-6 flex flex-wrap gap-3">
          {#each formats as f (f.key)}
            <form method="POST" action="/panier?/add" use:enhance>
              <input type="hidden" name="id" value={b.id} />
              <input type="hidden" name="format" value={f.key} />
              <input type="hidden" name="qty" value="1" />
              <button type="submit" class="flex items-center gap-2.5 border-2 border-foreground px-4 py-2.5 font-display text-sm font-bold uppercase tracking-wide transition-colors hover:bg-foreground hover:text-background">
                {#if f.key === 'epub'}<FileText size={20} weight="regular" />{:else if f.key === 'souscription'}<HandCoins size={20} weight="regular" />{:else}<BookOpen size={20} weight="regular" />{/if}
                Format {f.label} <span>({euros(f.price)})</span>
              </button>
            </form>
          {/each}
        </div>
      {:else}
        <p class="mt-6 text-sm text-muted-foreground">Bientôt disponible.</p>
      {/if}

      {#if isForthcoming(b) && pubFull}
        <div class="mt-5 inline-block bg-link px-3 py-1.5 font-display text-sm font-semibold uppercase tracking-wide text-white">
          En librairie le {pubFull}{euros(b.price_paper) ? ` — ${euros(b.price_paper)}` : ''}
        </div>
      {/if}

      {#if b.description_html}
        <div class="prose-agone mt-7 max-w-none text-[15px] leading-relaxed [&_a]:text-link [&_a:hover]:underline [&_p]:mb-3.5">
          {@html b.description_html}
        </div>
      {/if}
      {#if b.extra_info_html}
        <div class="mt-4 border-l-2 border-link bg-secondary/50 p-4 text-sm text-muted-foreground [&_p]:mb-2">{@html b.extra_info_html}</div>
      {/if}
    </div>

    <!-- Sidebar : du même auteur / même collection -->
    <aside class="space-y-8">
      {#if data.sameAuthor.length}
        <div>
          <div class="tick-label mb-3">Du même auteur</div>
          <ul class="space-y-3">
            {#each data.sameAuthor as s (s.slug)}
              <li><a href="/livre/{s.slug}" class="group flex gap-2.5">
                <span class="h-16 w-11 shrink-0 overflow-hidden border border-border bg-muted">{#if s.cover_url}<img src={s.cover_url} alt="" class="size-full object-cover" />{/if}</span>
                <span class="min-w-0"><span class="line-clamp-2 font-display text-sm font-medium uppercase leading-tight group-hover:text-link">{s.title}</span></span>
              </a></li>
            {/each}
          </ul>
        </div>
      {/if}
      {#if data.sameCollection.length}
        <div>
          <div class="tick-label mb-3">Même collection</div>
          <ul class="space-y-3">
            {#each data.sameCollection as s (s.slug)}
              <li><a href="/livre/{s.slug}" class="group flex gap-2.5">
                <span class="h-16 w-11 shrink-0 overflow-hidden border border-border bg-muted">{#if s.cover_url}<img src={s.cover_url} alt="" class="size-full object-cover" />{/if}</span>
                <span class="min-w-0"><span class="line-clamp-2 font-display text-sm font-medium uppercase leading-tight group-hover:text-link">{s.title}</span>{#if s.authors?.length}<span class="mt-0.5 block text-xs text-muted-foreground">{s.authors[0].name}</span>{/if}</span>
              </a></li>
            {/each}
          </ul>
        </div>
      {/if}
    </aside>
  </div>
</div>

<Lightbox images={images} bind:open={lbOpen} bind:index={lbIndex} alt={b.title} />
