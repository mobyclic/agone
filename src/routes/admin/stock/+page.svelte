<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { MagnifyingGlass, ArrowsClockwise, Warning } from 'phosphor-svelte';
  let { data, form } = $props();
  const fmt = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR') : '—');
</script>

<svelte:head><title>Stock · Admin Agone</title></svelte:head>

<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
  <div><h2 class="text-xl font-bold">Stock</h2><p class="text-sm text-muted-foreground">Synchronisé depuis Les Belles Lettres (BLDD) par ISBN.</p></div>
  <form method="POST" action="?/sync" use:enhance>
    <Button type="submit" disabled={!data.blConfigured}><ArrowsClockwise size={16} /> Synchroniser le stock BLDD</Button>
  </form>
</div>

{#if !data.blConfigured}
  <p class="mb-4 flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning"><Warning size={16} /> Identifiants extranet BLDD non configurés (BL_EXTRANET_USER / BL_EXTRANET_PASS dans .env).</p>
{/if}
{#if form?.error}<p class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}

{#if data.movements.length}
  <div class="mb-6">
    <h3 class="eyebrow mb-2">Derniers mouvements</h3>
    <div class="overflow-x-auto rounded-lg border border-border bg-card">
      <table class="w-full text-sm">
        <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground"><tr><th class="px-3 py-2 font-medium">Titre</th><th class="px-3 py-2 font-medium">EAN</th><th class="px-3 py-2 text-right font-medium">Avant</th><th class="px-3 py-2 text-right font-medium">Après</th><th class="px-3 py-2 text-right font-medium">Δ</th><th class="px-3 py-2 font-medium">Date</th></tr></thead>
        <tbody class="divide-y divide-border">
          {#each data.movements as m (m.isbn + m.synced_at)}
            <tr><td class="px-3 py-2">{m.title}</td><td class="px-3 py-2 font-mono text-xs text-muted-foreground">{m.isbn}</td><td class="px-3 py-2 text-right text-muted-foreground">{m.old_qty}</td><td class="px-3 py-2 text-right">{m.new_qty}</td><td class="px-3 py-2 text-right {m.delta >= 0 ? 'text-success' : 'text-destructive'}">{m.delta > 0 ? '+' : ''}{m.delta}</td><td class="px-3 py-2 text-muted-foreground">{fmt(m.synced_at)}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}

<form method="GET" class="mb-4 max-w-md">
  <div class="relative">
    <MagnifyingGlass size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input name="q" value={data.q ?? ''} placeholder="Rechercher un titre…" class="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
  </div>
</form>

<div class="overflow-x-auto rounded-lg border border-border bg-card">
  <table class="w-full text-sm">
    <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground"><tr><th class="px-3 py-2 font-medium">Titre</th><th class="px-3 py-2 font-medium">EAN</th><th class="px-3 py-2 text-right font-medium">Stock</th><th class="px-3 py-2 font-medium">Sync.</th></tr></thead>
    <tbody class="divide-y divide-border">
      {#each data.books as b (b.isbn_paper)}
        <tr class="hover:bg-muted/30"><td class="px-3 py-2">{b.title}</td><td class="px-3 py-2 font-mono text-xs text-muted-foreground">{b.isbn_paper}</td><td class="px-3 py-2 text-right {b.stock_qty > 0 ? '' : 'text-destructive'}">{b.stock_qty}</td><td class="px-3 py-2 text-muted-foreground">{fmt(b.stock_synced_at)}</td></tr>
      {/each}
    </tbody>
  </table>
</div>
