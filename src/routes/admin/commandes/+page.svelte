<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { MagnifyingGlass, Plus } from 'phosphor-svelte';
  import { Button } from '$lib/components/ui/button';
  import { ORDER_STATUS_LABEL, euros } from '$lib/labels';

  let { data } = $props();
  const pageCount = $derived(Math.max(1, Math.ceil(data.total / data.limit)));
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

  const statusTone: Record<string, string> = {
    pending: 'bg-warning/15 text-warning', paid: 'bg-success/15 text-success',
    processing: 'bg-accent text-accent-foreground', sent_to_bl: 'bg-accent text-accent-foreground',
    completed: 'bg-success/15 text-success', cancelled: 'bg-muted text-muted-foreground',
    refunded: 'bg-muted text-muted-foreground', failed: 'bg-destructive/10 text-destructive'
  };

  let q = $state(untrack(() => data.q ?? ''));
  let timer: ReturnType<typeof setTimeout>;

  function nav(params: Record<string, string | number | undefined>) {
    const merged: Record<string, string | number | undefined> = { q, status: data.status, page: data.page, ...params };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === '' || (k === 'page' && v === 1)) continue;
      sp.set(k, String(v));
    }
    const s = sp.toString();
    goto(`/admin/commandes${s ? `?${s}` : ''}`, { keepFocus: true, replaceState: true, noScroll: true });
  }
  function onSearch() {
    clearTimeout(timer);
    timer = setTimeout(() => nav({ q, page: 1 }), 220);
  }
</script>

<svelte:head><title>Commandes · Admin Agone</title></svelte:head>

<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">Commandes</h2>
    <p class="text-sm text-muted-foreground">{data.total} commande{data.total > 1 ? 's' : ''}</p>
  </div>
  <Button href="/admin/commandes/nouvelle"><Plus size={16} /> Nouvelle commande</Button>
</div>

<div class="mb-4 flex flex-wrap gap-2">
  <div class="relative min-w-[240px] flex-1">
    <MagnifyingGlass size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input bind:value={q} oninput={onSearch} placeholder="N° de commande, client, e-mail…" autocomplete="off"
      class="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
  </div>
  <select value={data.status ?? ''} onchange={(e) => nav({ status: e.currentTarget.value || undefined, page: 1 })}
    class="h-10 rounded-md border border-border bg-background px-3 text-sm">
    <option value="">Tous les statuts</option>
    {#each Object.entries(ORDER_STATUS_LABEL) as [k, v] (k)}<option value={k}>{v}</option>{/each}
  </select>
</div>

<div class="overflow-x-auto rounded-lg border border-border bg-card">
  <table class="w-full text-sm">
    <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
      <tr>
        <th class="px-3 py-2 font-medium">N°</th>
        <th class="px-3 py-2 font-medium">Client</th>
        <th class="px-3 py-2 font-medium">Contenu</th>
        <th class="px-3 py-2 font-medium">Statut</th>
        <th class="px-3 py-2 text-right font-medium">Total</th>
        <th class="px-3 py-2 text-right font-medium">Date</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each data.orders as o (o.number)}
        <tr class="hover:bg-muted/30">
          <td class="px-3 py-2"><a href="/admin/commandes/{o.number}" class="font-medium hover:text-link">#{o.number}</a></td>
          <td class="px-3 py-2">
            <div class="text-foreground">{o.customer_name || 'Invité'}</div>
            <div class="text-xs text-muted-foreground">{o.customer_email || o.email || '—'}</div>
          </td>
          <td class="px-3 py-2 text-xs text-muted-foreground">
            {o.item_count} article{o.item_count > 1 ? 's' : ''}
            {#if o.has_ebook}· numérique{/if}{#if o.has_physical}· papier{/if}
          </td>
          <td class="px-3 py-2"><span class="rounded px-2 py-0.5 text-xs font-medium {statusTone[o.status] ?? 'bg-secondary'}">{ORDER_STATUS_LABEL[o.status] ?? o.status}</span></td>
          <td class="px-3 py-2 text-right tabular-nums">{euros(o.total)}</td>
          <td class="px-3 py-2 text-right text-muted-foreground">{dateFr(o.created_at)}</td>
        </tr>
      {/each}
      {#if data.orders.length === 0}
        <tr><td colspan="6" class="px-3 py-10 text-center text-muted-foreground">Aucune commande ne correspond.</td></tr>
      {/if}
    </tbody>
  </table>
</div>

{#if pageCount > 1}
  <div class="mt-6 flex items-center justify-center gap-2 text-sm">
    {#if data.page > 1}<button type="button" onclick={() => nav({ page: data.page - 1 })} class="rounded-md border border-border px-3 py-2 hover:bg-muted">←</button>{/if}
    <span class="px-3 py-2 text-muted-foreground">Page {data.page} / {pageCount}</span>
    {#if data.page < pageCount}<button type="button" onclick={() => nav({ page: data.page + 1 })} class="rounded-md border border-border px-3 py-2 hover:bg-muted">→</button>{/if}
  </div>
{/if}
