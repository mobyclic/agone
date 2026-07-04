<script lang="ts">
  interface Book {
    title: string;
    subtitle?: string;
    slug: string;
    price_paper?: number;
    cover_url?: string;
    status?: string;
    authors?: { name: string; slug: string }[];
  }
  let { book }: { book: Book } = $props();
  const price = $derived(
    book.price_paper != null ? `${book.price_paper.toFixed(2).replace('.', ',')} €` : ''
  );
</script>

<a href="/livre/{book.slug}" class="group block">
  <div class="relative aspect-[2/3] overflow-hidden rounded-md border border-border bg-muted shadow-sm">
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
    {#if book.status === 'forthcoming'}
      <span class="absolute left-2 top-2 rounded bg-ink px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
        À paraître
      </span>
    {/if}
  </div>
  <div class="mt-2">
    <h3 class="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-link">{book.title}</h3>
    {#if book.authors?.length}
      <p class="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
        {book.authors.map((a) => a.name).join(', ')}
      </p>
    {/if}
    {#if price}<p class="mt-1 text-xs font-medium text-foreground">{price}</p>{/if}
  </div>
</a>
