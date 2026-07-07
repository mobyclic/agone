<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import { Plus, MagnifyingGlass, Download } from 'phosphor-svelte';
  import { euros } from '$lib/labels';

  let { data } = $props();
  const pageCount = $derived(Math.max(1, Math.ceil(data.total / data.limit)));
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  const KINDS = [{ k: '', label: 'Tout' }, { k: 'invoice', label: 'Factures' }, { k: 'credit_note', label: 'Avoirs' }];

  let q = $state(untrack(() => data.q ?? ''));
  let timer: ReturnType<typeof setTimeout>;
  function nav(params: Record<string, string | number | undefined>) {
    const merged: Record<string, string | number | undefined> = { q, kind: data.kind, page: data.page, ...params };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === '' || (k === 'page' && v === 1)) continue;
      sp.set(k, String(v));
    }
    const s = sp.toString();
    goto(`/admin/factures${s ? `?${s}` : ''}`, { keepFocus: true, replaceState: true, noScroll: true });
  }
  function onSearch() { clearTimeout(timer); timer = setTimeout(() => nav({ q, page: 1 }), 220); }
</script>

<svelte:head><title>Facturation · Admin Agone</title></svelte:head>

<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">Facturation</h2>
    <p class="text-sm text-muted-foreground">{data.total} document{data.total > 1 ? 's' : ''}</p>
  </div>
  <Button href="/admin/factures/nouvelle"><Plus size={16} /> Facture / avoir manuel</Button>
</div>

<div class="mb-4 flex flex-wrap gap-2">
  <div class="relative min-w-[240px] flex-1">
    <MagnifyingGlass size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input bind:value={q} oninput={onSearch} placeholder="N° de facture ou client…" autocomplete="off"
      class="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
  </div>
  <div class="flex overflow-hidden rounded-md border border-border">
    {#each KINDS as w (w.k)}
      <button type="button" class="px-3 py-2 text-sm {(data.kind ?? '') === w.k ? 'bg-foreground text-background' : 'hover:bg-muted'}" onclick={() => nav({ kind: w.k || undefined, page: 1 })}>{w.label}</button>
    {/each}
  </div>
</div>

<div class="overflow-x-auto rounded-lg border border-border bg-card">
  <table class="w-full text-sm">
    <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
      <tr>
        <th class="px-3 py-2 font-medium">N°</th>
        <th class="px-3 py-2 font-medium">Type</th>
        <th class="px-3 py-2 font-medium">Client</th>
        <th class="px-3 py-2 font-medium">Commande</th>
        <th class="px-3 py-2 text-right font-medium">Total TTC</th>
        <th class="px-3 py-2 text-right font-medium">Date</th>
        <th class="px-3 py-2 text-right font-medium">PDF</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each data.invoices as f (f.id)}
        <tr class="hover:bg-muted/30">
          <td class="px-3 py-2"><a href="/admin/factures/{f.id}" class="font-medium hover:text-link">{f.ref}</a></td>
          <td class="px-3 py-2">
            {#if f.kind === 'credit_note'}<span class="rounded bg-warning/15 px-2 py-0.5 text-xs text-warning">Avoir</span>{:else}<span class="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">Facture</span>{/if}
          </td>
          <td class="px-3 py-2 text-muted-foreground">{f.name || '—'}</td>
          <td class="px-3 py-2 text-muted-foreground">{#if f.order_number}<a href="/admin/commandes/{f.order_number}" class="hover:text-link">#{f.order_number}</a>{:else}—{/if}</td>
          <td class="px-3 py-2 text-right tabular-nums">{f.kind === 'credit_note' ? '−' : ''}{euros(f.total_ttc)}</td>
          <td class="px-3 py-2 text-right text-muted-foreground">{dateFr(f.issued_at)}</td>
          <td class="px-3 py-2 text-right"><a href="/admin/factures/{f.id}/pdf?dl=1" class="inline-flex text-muted-foreground hover:text-foreground" aria-label="Télécharger"><Download size={16} /></a></td>
        </tr>
      {/each}
      {#if data.invoices.length === 0}
        <tr><td colspan="7" class="px-3 py-10 text-center text-muted-foreground">Aucune facture pour le moment.</td></tr>
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
