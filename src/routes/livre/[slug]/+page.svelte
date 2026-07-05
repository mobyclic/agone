<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import { ROLE_LABEL, euros } from '$lib/labels';
  import { ArrowLeft, ShoppingCart, PencilSimple } from 'phosphor-svelte';

  let { data } = $props();
  const b = $derived(data.book);
  const isStaff = $derived(['admin', 'editor'].includes(page.data.user?.role ?? ''));
  const bookId = $derived(String(b.id).replace(/^book:/, ''));

  const formats = $derived(
    [
      b.price_paper != null ? { key: 'papier', label: 'Papier', price: b.price_paper } : null,
      b.price_ebook != null ? { key: 'epub', label: 'Numérique (ePub)', price: b.price_ebook } : null,
      b.subscription_price != null && b.status === 'forthcoming'
        ? { key: 'souscription', label: 'Souscription', price: b.subscription_price }
        : null
    ].filter((x): x is { key: string; label: string; price: number } => x !== null)
  );
  let selectedFormat = $state('');
  $effect(() => { if (!selectedFormat && formats.length) selectedFormat = formats[0].key; });

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
    <!-- Couverture + achat -->
    <div class="space-y-4">
      <div class="bg-ink p-5">
        <div class="relative aspect-[2/3] overflow-hidden border border-white/10 bg-neutral-800 shadow-2xl">
          {#if b.cover_url}
            <img src={b.cover_url} alt={b.title} class="size-full object-cover" />
          {:else}
            <div class="flex size-full items-end p-4"><span class="font-display text-lg uppercase leading-tight text-white">{b.title}</span></div>
          {/if}
        </div>
      </div>

      <div class="border border-border p-4">
        <div class="space-y-1.5 text-sm">
          {#if euros(b.price_paper)}<div class="flex items-baseline justify-between"><span class="text-muted-foreground">Papier</span><span class="text-xl font-bold">{euros(b.price_paper)}</span></div>{/if}
          {#if euros(b.price_ebook)}<div class="flex items-baseline justify-between"><span class="text-muted-foreground">Numérique</span><span class="font-semibold">{euros(b.price_ebook)}</span></div>{/if}
        </div>
        {#if formats.length}
          <form method="POST" action="/panier?/add" use:enhance class="mt-4 space-y-3">
            <input type="hidden" name="id" value={b.id} />
            {#if formats.length > 1}
              <div class="flex flex-col gap-1.5">
                {#each formats as f (f.key)}
                  <label class="flex cursor-pointer items-center justify-between border px-3 py-2 text-sm {selectedFormat === f.key ? 'border-foreground bg-accent' : 'border-border'}">
                    <input type="radio" name="format" value={f.key} bind:group={selectedFormat} class="sr-only" />
                    <span>{f.label}</span><span class="font-semibold">{euros(f.price)}</span>
                  </label>
                {/each}
              </div>
            {:else}
              <input type="hidden" name="format" value={formats[0].key} />
            {/if}
            <input type="hidden" name="qty" value="1" />
            <button type="submit" class="btn-brand flex h-11 w-full items-center justify-center gap-2 font-display text-sm font-medium uppercase tracking-wide">
              <ShoppingCart size={16} /> Ajouter au panier
            </button>
          </form>
        {:else}
          <button type="button" disabled class="btn-brand mt-4 h-11 w-full font-display text-sm font-medium uppercase tracking-wide opacity-60">Bientôt disponible</button>
        {/if}
      </div>
    </div>

    <!-- Contenu -->
    <div class="min-w-0">
      <h1 class="display-title text-4xl leading-[0.95] sm:text-5xl">{b.title}</h1>
      {#if b.subtitle}<p class="mt-3 text-lg text-muted-foreground">{b.subtitle}</p>{/if}

      <div class="mt-4">
        {#if b.contributors?.length}
          {#each b.contributors as c (c.role)}
            <p class="font-display text-sm">
              {#if c.role !== 'author'}<span class="text-muted-foreground">{ROLE_LABEL[c.role] ?? c.role} : </span>{/if}
              {#each c.people as p, i (p.slug)}<a href="/auteur/{p.slug}" class="link font-semibold uppercase tracking-wide">{p.name}</a>{#if i < c.people.length - 1}<span>, </span>{/if}{/each}
            </p>
          {/each}
        {/if}
        {#if collection}<a href="/collections/{collection.slug}" class="mt-1 inline-block font-display text-sm font-medium uppercase tracking-wide text-foreground hover:text-link">{collection.name}</a>{/if}
      </div>

      {#if b.status === 'forthcoming' && pubFull}
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

      <dl class="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 border-t-2 border-foreground pt-6 text-sm sm:grid-cols-4">
        {#if pubLabel}<div><dt class="text-muted-foreground">Parution</dt><dd class="font-medium capitalize">{pubLabel}</dd></div>{/if}
        {#if b.page_count}<div><dt class="text-muted-foreground">Pages</dt><dd class="font-medium">{b.page_count}</dd></div>{/if}
        {#if dims}<div><dt class="text-muted-foreground">Format</dt><dd class="font-medium">{dims}</dd></div>{/if}
        {#if b.isbn_paper}<div><dt class="text-muted-foreground">ISBN</dt><dd class="font-mono text-xs font-medium">{b.isbn_paper}</dd></div>{/if}
        {#if b.title_original}<div class="col-span-2"><dt class="text-muted-foreground">Titre original</dt><dd class="font-medium">{b.title_original}{b.language_original ? ` (${b.language_original})` : ''}</dd></div>{/if}
      </dl>
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
