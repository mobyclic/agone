<script lang="ts">
  import { DownloadSimple, BookOpen } from 'phosphor-svelte';
  import { Button } from '$lib/components/ui/button';
  let { data } = $props();
  const assetId = (id: string) => String(id).replace('ebook_asset:', '');
</script>

<svelte:head><title>Ma bibliothèque · Agone</title></svelte:head>

<h2 class="text-xl font-bold">Ma bibliothèque numérique</h2>
<p class="mb-6 text-sm text-muted-foreground">Vos ebooks achetés, téléchargeables à volonté.</p>

{#if data.books.length === 0}
  <div class="rounded-lg border border-border bg-card p-10 text-center">
    <BookOpen size={32} class="mx-auto text-muted-foreground" />
    <p class="mt-3 text-muted-foreground">Vous n’avez pas encore d’ebook.</p>
    <Button href="/catalogue" variant="brand" class="mt-4">Découvrir le catalogue</Button>
  </div>
{:else}
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each data.books as b (b.asset_id)}
      <div class="flex gap-3 rounded-lg border border-border bg-card p-3">
        <a href="/livre/{b.slug}" class="h-24 w-16 shrink-0 overflow-hidden rounded border border-border bg-muted">
          {#if b.cover_url}<img src={b.cover_url} alt="" class="size-full object-cover" />{/if}
        </a>
        <div class="flex min-w-0 flex-col">
          <a href="/livre/{b.slug}" class="line-clamp-2 font-medium leading-snug hover:text-link">{b.title}</a>
          <span class="mt-0.5 text-xs uppercase text-muted-foreground">{b.format}</span>
          <div class="mt-auto pt-2">
            {#if b.status === 'available'}
              <a href="/api/ebook/{assetId(b.asset_id)}/download" class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-black">
                <DownloadSimple size={14} /> Télécharger
              </a>
            {:else}
              <span class="text-xs text-muted-foreground">Fichier bientôt disponible</span>
            {/if}
          </div>
        </div>
      </div>
    {/each}
  </div>
{/if}
