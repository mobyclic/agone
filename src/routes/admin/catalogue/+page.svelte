<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Plus, MagnifyingGlass } from 'phosphor-svelte';

  let { data } = $props();
  const pageCount = $derived(Math.max(1, Math.ceil(data.total / data.limit)));
  const STATUS: Record<string, string> = { published: 'Publié', draft: 'Brouillon', forthcoming: 'À paraître', out_of_print: 'Épuisé' };
  const euro = (n?: number) => (n != null ? `${n.toFixed(2).replace('.', ',')} €` : '—');
  function qs(p: Record<string, string | number | undefined>) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: data.q, status: data.status, ...p })) if (v !== undefined && v !== '') sp.set(k, String(v));
    const s = sp.toString(); return s ? `?${s}` : '';
  }
</script>

<svelte:head><title>Catalogue · Admin Agone</title></svelte:head>

<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">Catalogue</h2>
    <p class="text-sm text-muted-foreground">{data.total} livres</p>
  </div>
  <Button href="/admin/catalogue/nouveau"><Plus size={16} /> Nouveau livre</Button>
</div>

<form method="GET" class="mb-4 flex flex-wrap gap-2">
  <div class="relative min-w-[220px] flex-1">
    <MagnifyingGlass size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input name="q" value={data.q ?? ''} placeholder="Rechercher un titre…" class="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
  </div>
  <select name="status" class="h-10 rounded-md border border-border bg-background px-3 text-sm">
    <option value="">Tous les statuts</option>
    {#each Object.entries(STATUS) as [k, v] (k)}<option value={k} selected={data.status === k}>{v}</option>{/each}
  </select>
  <button type="submit" class="h-10 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted">Filtrer</button>
</form>

<div class="overflow-x-auto rounded-lg border border-border bg-card">
  <table class="w-full text-sm">
    <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
      <tr>
        <th class="px-3 py-2 font-medium">Livre</th>
        <th class="px-3 py-2 font-medium">Statut</th>
        <th class="px-3 py-2 font-medium">ISBN</th>
        <th class="px-3 py-2 text-right font-medium">Prix</th>
        <th class="px-3 py-2 text-right font-medium">Stock</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each data.books as b (b.id)}
        <tr class="hover:bg-muted/30">
          <td class="px-3 py-2">
            <a href="/admin/catalogue/{String(b.id).replace('book:', '')}" class="flex items-center gap-3">
              <span class="h-12 w-9 shrink-0 overflow-hidden rounded border border-border bg-muted">
                {#if b.cover_url}<img src={b.cover_url} alt="" class="size-full object-cover" />{/if}
              </span>
              <span class="font-medium hover:text-primary">{b.title}</span>
            </a>
          </td>
          <td class="px-3 py-2"><span class="rounded bg-secondary px-2 py-0.5 text-xs">{STATUS[b.status] ?? b.status}</span></td>
          <td class="px-3 py-2 font-mono text-xs text-muted-foreground">{b.isbn_paper ?? '—'}</td>
          <td class="px-3 py-2 text-right">{euro(b.price_paper)}</td>
          <td class="px-3 py-2 text-right {b.stock_qty > 0 ? '' : 'text-destructive'}">{b.stock_qty}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

{#if pageCount > 1}
  <div class="mt-6 flex items-center justify-center gap-2 text-sm">
    {#if data.page > 1}<a href={qs({ page: data.page - 1 })} class="rounded-md border border-border px-3 py-2 hover:bg-muted">←</a>{/if}
    <span class="px-3 py-2 text-muted-foreground">Page {data.page} / {pageCount}</span>
    {#if data.page < pageCount}<a href={qs({ page: data.page + 1 })} class="rounded-md border border-border px-3 py-2 hover:bg-muted">→</a>{/if}
  </div>
{/if}
