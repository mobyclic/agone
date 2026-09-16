<script lang="ts">
  import { embedsSociaux } from '$lib/client/embeds';
  import { enhance } from '$app/forms';
  import { invalidate } from '$app/navigation';
  import { page } from '$app/state';
  import { fade, scale } from 'svelte/transition';
  import { Button } from '$lib/components/ui/button';
  import Lightbox from '$lib/components/Lightbox.svelte';
  import { ROLE_LABEL, euros, isForthcoming } from '$lib/labels';
  import { trackAddToCart, itemId } from '$lib/analytics';
  import { BookOpen, FileText, HandCoins, PencilSimple, MagnifyingGlassPlus, CheckCircle, X, ShoppingCart, SquaresFour, CircleNotch } from 'phosphor-svelte';

  let { data } = $props();
  const b = $derived(data.book);
  const images = $derived([b.cover_url, ...(b.gallery ?? [])].filter(Boolean) as string[]);
  let lbOpen = $state(false);
  let lbIndex = $state(0);
  const openLightbox = (i = 0) => { lbIndex = i; lbOpen = true; };

  // Modal « Ajouté au panier »
  let cartOpen = $state(false);
  let addedFormat = $state('');
  let loadingFormat = $state(''); // format en cours d'ajout (loader sur le bouton)
  // Livres associés (même collection + même auteur, dédoublonnés) pour le modal.
  const relatedBooks = $derived(
    [...(data.sameCollection ?? []), ...(data.sameAuthor ?? [])]
      .filter((x: any, i: number, arr: any[]) => arr.findIndex((y: any) => y.slug === x.slug) === i)
      // Écarte ce qui est déjà au panier ou déjà acheté (si connecté).
      .filter((x: any) => !(data.cartSlugs ?? []).includes(x.slug) && !(data.purchasedSlugs ?? []).includes(x.slug))
      .slice(0, 4)
  );
  // On intercepte la redirection vers /panier : on reste sur la fiche, on ouvre le modal
  // et on rafraîchit le compteur de panier (layout).
  function addToCart({ formData }: { formData: FormData }) {
    const f = formats.find((x) => x.key === formData.get('format'));
    addedFormat = f?.label ?? '';
    loadingFormat = String(formData.get('format') ?? '');
    return async ({ result, update }: any) => {
      if (result.type === 'redirect') {
        trackAddToCart({ item_id: itemId(b.id), item_name: b.title, price: f?.price ?? 0, quantity: 1, item_variant: f?.label, item_category: collection?.name });
        // Rafraîchit UNIQUEMENT le compteur panier (layout) — pas la fiche ni les
        // suggestions : d'où un ajout au panier quasi instantané.
        await invalidate('app:cart');
        cartOpen = true;
      } else {
        await update();
      }
      loadingFormat = '';
    };
  }
  const isStaff = $derived(['admin', 'editor'].includes(page.data.user?.role ?? ''));
  const bookId = $derived(String(b.id).replace(/^book:/, ''));

  const forthcoming = $derived(isForthcoming(b));
  // À paraître → aucun bouton d'achat, sauf souscription (prix + date de souscription).
  const formats = $derived.by(() => {
    if (forthcoming) {
      return b.subscription_price != null && b.subscription_end
        ? [{ key: 'souscription', label: 'Souscription', price: b.subscription_price }]
        : [];
    }
    return [
      b.price_paper != null ? { key: 'papier', label: 'Papier', price: b.price_paper } : null,
      b.price_ebook != null ? { key: 'epub', label: 'ePub', price: b.price_ebook } : null
    ].filter((x): x is { key: string; label: string; price: number } => x !== null);
  });
  const subEndLabel = $derived(b.subscription_end ? new Date(b.subscription_end).toLocaleDateString('fr-FR') : null);

  const mainAuthors = $derived((b.contributors ?? []).find((c: any) => c.role === 'author')?.people ?? []);
  const otherContributors = $derived((b.contributors ?? []).filter((c: any) => c.role !== 'author'));

  const pubFull = $derived(b.published_at ? new Date(b.published_at).toLocaleDateString('fr-FR') : null);
  const pubLabel = $derived(b.published_at ? new Date(b.published_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : null);
  const dims = $derived(b.width_cm && b.height_cm ? `${b.width_cm} × ${b.height_cm} cm` : null);
  const collection = $derived(b.collections?.[0]);
</script>

<svelte:head><title>{b.title} · Agone</title></svelte:head>

<!-- Fiche livre : PAS de gros header (exception) — le titre vit dans la colonne de contenu. -->
<div class="py-8" style="padding-inline: var(--page-gutter)">
  {#if isStaff}
    <div class="fixed bottom-6 right-6 z-40">
      <Button href="/admin/catalogue/{bookId}" variant="outline" class="bg-background shadow-2xl"><PencilSimple size={16} /> Éditer</Button>
    </div>
  {/if}

  <!-- Deux tiers : couverture + contenu. Un tiers : colonne latérale. -->
  <div class="grid gap-8 lg:grid-cols-[2fr_1fr] lg:items-start lg:gap-12">
    <div class="grid gap-8 sm:grid-cols-[minmax(0,340px)_minmax(0,1fr)] sm:items-start">
    <!-- Couverture + infos annexes -->
    <div>
      {#if b.cover_url}
        <button type="button" onclick={() => openLightbox(0)} class="group block w-full cursor-zoom-in" aria-label="Agrandir la couverture">
          <div class="relative overflow-hidden border border-border bg-secondary/40">
            <img src={b.cover_url} alt={b.title} class="block h-auto w-full" />
            <span class="absolute right-2 top-2 grid size-8 place-items-center bg-background/85 text-foreground opacity-0 transition-opacity group-hover:opacity-100"><MagnifyingGlassPlus size={16} /></span>
          </div>
        </button>
      {:else}
        <div class="relative aspect-[2/3] overflow-hidden border border-border bg-ink">
          <div class="flex size-full items-end p-4"><span class="font-display text-lg uppercase leading-tight text-white">{b.title}</span></div>
        </div>
      {/if}

      <dl class="mt-6 space-y-3 text-sm">
        {#if pubLabel}<div class="flex justify-between gap-3"><dt class="text-muted-foreground">Parution</dt><dd class="text-right font-medium capitalize">{pubLabel}</dd></div>{/if}
        {#if b.page_count}<div class="flex justify-between gap-3"><dt class="text-muted-foreground">Pages</dt><dd class="font-medium">{b.page_count}</dd></div>{/if}
        {#if dims}<div class="flex justify-between gap-3"><dt class="text-muted-foreground">Format</dt><dd class="font-medium">{dims}</dd></div>{/if}
        {#if b.isbn_paper}<div class="flex justify-between gap-3"><dt class="text-muted-foreground">ISBN</dt><dd class="font-mono text-xs font-medium">{b.isbn_paper}</dd></div>{/if}
        {#if b.title_original}<div><dt class="text-muted-foreground">Titre original</dt><dd class="mt-0.5 font-medium">{b.title_original}{b.language_original ? ` (${b.language_original})` : ''}</dd></div>{/if}
      </dl>
    </div>

    <!-- Contenu -->
    <div class="min-w-0">
      <!-- Fil d'Ariane, au-dessus du titre, en petit : Catalogue / Collection -->
      <nav class="mb-3 flex flex-wrap items-center gap-1.5 font-display text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <a href="/catalogue" class="hover:text-foreground">Catalogue</a>
        {#if collection}<span class="opacity-40">/</span><a href="/collections/{collection.slug}" class="hover:text-foreground">{collection.name}</a>{/if}
      </nav>

      <h2 class="display-title text-3xl leading-tight sm:text-4xl">{b.title}</h2>
      {#if b.subtitle}<p class="mt-2 text-base leading-snug text-muted-foreground">{b.subtitle}</p>{/if}

      <!-- Auteur principal : sous le titre, plus gros -->
      {#if mainAuthors.length}
        <p class="mt-2 font-display text-xl font-semibold uppercase tracking-wide sm:text-2xl">
          {#each mainAuthors as p, i (p.slug)}<a href="/auteur/{p.slug}" class="link">{p.name}</a>{#if i < mainAuthors.length - 1}<span>,</span>{' '}{/if}{/each}
        </p>
      {/if}

      <!-- Autres contributeurs -->
      {#if otherContributors.length}
        <div class="mt-2 space-y-0.5">
          {#each otherContributors as c (c.role)}
            <p class="font-display text-xs">
              <span class="text-muted-foreground">{ROLE_LABEL[c.role] ?? c.role} :</span>{' '}{#each c.people as p, i (p.slug)}<a href="/auteur/{p.slug}" class="link font-semibold uppercase tracking-wide">{p.name}</a>{#if i < c.people.length - 1}<span>,</span>{' '}{/if}{/each}
            </p>
          {/each}
        </div>
      {/if}

      <!-- Boutons d'achat par format -->
      {#if formats.length}
        <div class="mt-6 flex flex-wrap gap-3">
          {#each formats as f (f.key)}
            <form method="POST" action="/panier?/add" use:enhance={addToCart}>
              <input type="hidden" name="id" value={b.id} />
              <input type="hidden" name="format" value={f.key} />
              <input type="hidden" name="qty" value="1" />
              <button type="submit" disabled={loadingFormat === f.key} class="flex items-center gap-2.5 border-2 border-foreground px-4 py-2.5 font-display text-sm font-bold uppercase tracking-wide transition-colors hover:bg-foreground hover:text-background disabled:cursor-wait disabled:opacity-70">
                {#if loadingFormat === f.key}<CircleNotch size={20} weight="bold" class="animate-spin" />{:else if f.key === 'epub'}<FileText size={20} weight="regular" />{:else if f.key === 'souscription'}<HandCoins size={20} weight="regular" />{:else}<BookOpen size={20} weight="regular" />{/if}
                {f.key === 'souscription' ? 'Souscrire' : `Format ${f.label}`} <span>({euros(f.price)})</span>
              </button>
            </form>
          {/each}
        </div>
      {:else if !forthcoming}
        <p class="mt-6 text-sm text-muted-foreground">Bientôt disponible.</p>
      {/if}

      {#if forthcoming && pubFull}
        <div class="mt-5 inline-block bg-link px-3 py-1.5 font-display text-sm font-semibold uppercase tracking-wide text-white">
          En librairie le {pubFull}
        </div>
      {/if}
      {#if forthcoming && formats.length && subEndLabel}
        <p class="mt-2 text-sm text-muted-foreground">Souscription ouverte jusqu'au {subEndLabel}.</p>
      {/if}

      {#if b.description_html}
        <div use:embedsSociaux class="prose-agone texte-justifie mt-7 max-w-none text-[15px] leading-relaxed [&_a]:text-link [&_a:hover]:underline [&_p]:mb-3.5">
          {@html b.description_html}
        </div>
      {/if}
      {#if b.extra_info_html}
        <div class="mt-4 border-l-2 border-link bg-secondary/50 p-4 text-sm text-muted-foreground [&_p]:mb-2">{@html b.extra_info_html}</div>
      {/if}
    </div>

    </div>

    <!-- Sidebar : du même auteur / dans la même collection -->
    <aside class="space-y-8">
      {#if data.sameAuthor.length}
        <div>
          <div class="tick-label mb-3">Du même auteur</div>
          <!-- Couvertures seules, sur deux colonnes : l'auteur étant le même que
               celui de la fiche, répéter son nom n'apprendrait rien. Le titre
               revient en surimpression au survol (et au focus clavier). -->
          <!-- Largeur bornée : sur un écran large, deux colonnes libres donnaient des
               couvertures de 380 px, hors de proportion avec la colonne. ~190 px,
               soit le double des vignettes de « Dans la même collection ». -->
          <ul class="grid max-w-[400px] grid-cols-2 gap-3">
            {#each data.sameAuthor as s (s.slug)}
              <li>
                <a href="/livre/{s.slug}" class="group relative block overflow-hidden border border-border bg-muted focus:outline-none">
                  {#if s.cover_url}
                    <img src={s.cover_url} alt={s.title} loading="lazy" class="block aspect-[2/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
                  {:else}
                    <span class="flex aspect-[2/3] items-end bg-ink p-2"><span class="font-display text-xs uppercase leading-tight text-white">{s.title}</span></span>
                  {/if}
                  <span
                    class="pointer-events-none absolute inset-0 flex items-end bg-ink/75 p-2.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
                  >
                    <span class="line-clamp-4 font-display text-sm font-medium uppercase leading-tight text-white">{s.title}</span>
                  </span>
                </a>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
      {#if data.contributions.length}
        <div>
          <div class="tick-label mb-3">Ses autres contributions</div>
          <!-- Préface, postface, traduction, illustration… Trois colonnes, donc
               des couvertures plus petites que « Du même auteur » : ces titres
               ne sont pas de lui, ils pèsent moins dans la page. -->
          <ul class="grid max-w-[400px] grid-cols-3 gap-2.5">
            {#each data.contributions as s (s.slug)}
              <li>
                <a href="/livre/{s.slug}" class="group relative block overflow-hidden border border-border bg-muted focus:outline-none">
                  {#if s.cover_url}
                    <img src={s.cover_url} alt={s.title} loading="lazy" class="block aspect-[2/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
                  {:else}
                    <span class="flex aspect-[2/3] items-end bg-ink p-1.5"><span class="font-display text-[10px] uppercase leading-tight text-white">{s.title}</span></span>
                  {/if}
                  <span class="pointer-events-none absolute inset-0 flex items-end bg-ink/75 p-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                    <span class="line-clamp-4 font-display text-[11px] font-medium uppercase leading-tight text-white">{s.title}</span>
                  </span>
                </a>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if data.sameCollection.length}
        <div>
          <div class="tick-label mb-3">Dans la même collection</div>
          <!-- Même grille que « Ses autres contributions ». L'auteur change d'un
               titre à l'autre : il rejoint le titre dans la surimpression, pour
               que passer en couvertures seules ne perde pas l'information. -->
          <ul class="grid max-w-[400px] grid-cols-3 gap-2.5">
            {#each data.sameCollection as s (s.slug)}
              <li>
                <a href="/livre/{s.slug}" class="group relative block overflow-hidden border border-border bg-muted focus:outline-none">
                  {#if s.cover_url}
                    <img src={s.cover_url} alt={s.title} loading="lazy" class="block aspect-[2/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
                  {:else}
                    <span class="flex aspect-[2/3] items-end bg-ink p-1.5"><span class="font-display text-[10px] uppercase leading-tight text-white">{s.title}</span></span>
                  {/if}
                  <span class="pointer-events-none absolute inset-0 flex flex-col justify-end gap-0.5 bg-ink/75 p-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                    <span class="line-clamp-3 font-display text-[11px] font-medium uppercase leading-tight text-white">{s.title}</span>
                    {#if s.authors?.length}
                      <span class="line-clamp-1 font-display text-[10px] uppercase tracking-wide text-white/70">{s.authors[0].name}</span>
                    {/if}
                  </span>
                </a>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </aside>
  </div>
</div>

<Lightbox images={images} bind:open={lbOpen} bind:index={lbIndex} alt={b.title} />

<!-- Modal « Ajouté au panier » -->
<svelte:window onkeydown={(e) => { if (e.key === 'Escape') cartOpen = false; }} />
{#if cartOpen}
  <div class="fixed inset-0 z-[60] grid place-items-center p-4">
    <button type="button" class="absolute inset-0 cursor-default bg-black/50" aria-label="Fermer" onclick={() => (cartOpen = false)} transition:fade={{ duration: 150 }}></button>
    <div class="relative z-10 w-full max-w-md border border-border bg-background p-6 shadow-2xl" transition:scale={{ duration: 200, start: 0.95, opacity: 0 }}>
      <button type="button" onclick={() => (cartOpen = false)} class="absolute right-3 top-3 grid size-8 place-items-center text-muted-foreground hover:text-foreground" aria-label="Fermer"><X size={18} /></button>

      <div class="flex items-center gap-3">
        <CheckCircle size={28} weight="fill" class="text-foreground" />
        <div>
          <p class="font-display text-lg font-bold uppercase tracking-wide">Ajouté au panier</p>
          <p class="text-sm text-muted-foreground">{b.title}{addedFormat ? ` — ${addedFormat}` : ''}</p>
        </div>
      </div>

      <div class="mt-5 flex gap-3">
        <Button href="/catalogue" variant="outline" class="flex-1"><SquaresFour size={16} /> Catalogue</Button>
        <Button href="/panier" variant="brand" class="flex-1"><ShoppingCart size={16} /> Voir mon panier</Button>
      </div>

      {#if relatedBooks.length}
        <div class="mt-6 border-t border-border pt-4">
          <div class="tick-label mb-3">À découvrir aussi</div>
          <div class="grid grid-cols-4 gap-2.5">
            {#each relatedBooks as r (r.slug)}
              <a href="/livre/{r.slug}" onclick={() => (cartOpen = false)} class="group block" title={r.title}>
                <div class="aspect-[2/3] overflow-hidden border border-border bg-muted">
                  {#if r.cover_url}<img src={r.cover_url} alt={r.title} loading="lazy" class="size-full object-cover transition-transform group-hover:scale-[1.04]" />{/if}
                </div>
                <p class="mt-1 line-clamp-2 font-display text-[11px] font-medium uppercase leading-tight text-muted-foreground group-hover:text-link">{r.title}</p>
              </a>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
