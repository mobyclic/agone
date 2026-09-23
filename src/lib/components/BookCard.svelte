<script lang="ts">
  import { authorList, isForthcoming, formatsEnVente, estEpuise, euros } from '$lib/labels';
  interface Book {
    title: string;
    subtitle?: string;
    slug: string;
    price_paper?: number;
    subscription_price?: number;
    subscription_end?: string;
    cover_url?: string;
    status?: string;
    published_at?: string;
    price_ebook?: number;
    stock_qty?: number;
    has_ebook_file?: boolean;
    authors?: { name: string; slug: string; first_name?: string; last_name?: string }[];
  }
  let { book }: { book: Book } = $props();
  const authors = $derived(authorList(book.authors));
  const forthcoming = $derived(isForthcoming(book));
  /**
   * Prix affiché SEULEMENT si au moins un format est réellement en vente (mêmes
   * règles que la fiche : stock, prix > 0, fichier ebook déposé) — sinon le
   * catalogue annonçait un prix pour un titre impossible à commander.
   * `stock_qty` absent = données sans stock : on garde l'affichage d'avant.
   */
  const enVente = $derived(book.stock_qty === undefined ? null : formatsEnVente(book));
  const epuise = $derived(book.stock_qty !== undefined && estEpuise(book));
  const price = $derived.by(() => {
    if (enVente === null) {
      if (forthcoming) return book.subscription_price != null && book.subscription_end ? (euros(book.subscription_price) ?? '') : '';
      return euros(book.price_paper) ?? '';
    }
    // Papier d'abord (prix de référence), sinon le format disponible.
    const f = enVente.find((x) => x.key === 'papier') ?? enVente[0];
    return f ? (euros(f.price) ?? '') : '';
  });
  const pubDate = $derived(
    book.published_at
      ? new Date(book.published_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
      : ''
  );
</script>

<a href="/livre/{book.slug}" class="group block">
  <div class="relative aspect-[2/3] overflow-hidden border border-border bg-muted">
    {#if book.cover_url}
      <img
        src={book.cover_url}
        alt={book.title}
        loading="lazy"
        class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />
    {:else}
      <div class="flex size-full flex-col justify-between bg-gradient-to-br from-sidebar to-brand-blue p-3 text-white">
        <span class="text-[10px] uppercase tracking-[0.2em] opacity-60">Agone</span>
        <span class="line-clamp-5 text-sm font-semibold leading-tight">{book.title}</span>
      </div>
    {/if}
    {#if forthcoming}
      <span class="absolute left-0 top-2 bg-ink px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-white">
        À paraître
      </span>
    {:else if epuise}
      <span class="absolute left-0 top-2 bg-muted-foreground px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-white">
        Épuisé
      </span>
    {/if}
  </div>
  <div class="mt-2.5">
    <h3 class="line-clamp-2 font-sans text-sm font-bold leading-snug text-foreground group-hover:underline group-hover:underline-offset-4">{book.title}</h3>
    {#if book.subtitle}<p class="mt-px line-clamp-1 text-xs leading-snug text-muted-foreground">{book.subtitle}</p>{/if}
    {#if authors}<p class="mt-px line-clamp-1 text-xs text-link">{authors}</p>{/if}
    {#if forthcoming}
      {#if pubDate}<p class="mt-1 text-xs font-medium text-muted-foreground">En librairie le {pubDate}</p>{/if}
      {#if price}<p class="mt-0.5 text-xs font-medium text-foreground">Souscription {price}</p>{/if}
    {:else if price}
      <p class="mt-1 text-xs font-medium text-foreground">{price}</p>
    {:else if epuise}
      <p class="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Épuisé</p>
    {/if}
  </div>
</a>
