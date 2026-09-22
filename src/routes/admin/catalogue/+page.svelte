<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import Pagination from '$lib/components/Pagination.svelte';
  import { Plus, MagnifyingGlass, CaretUp, CaretDown } from 'phosphor-svelte';
  import { BOOK_STATUS_LABEL, bookDerivedState } from '$lib/labels';

  let { data } = $props();

  const pageCount = $derived(Math.max(1, Math.ceil(data.total / data.limit)));
  // Options du filtre : les 3 statuts stockés, puis les 2 états dérivés (filtres virtuels).
  const STATUS: Record<string, string> = { ...BOOK_STATUS_LABEL, forthcoming: 'À paraître', epuise: 'Épuisé' };
  const euro = (n?: number) => (n != null ? `${n.toFixed(2).replace('.', ',')} €` : '—');
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');
  const nu = (id: string) => String(id).replace('book:', '');
  const STATUT_CLS: Record<string, string> = {
    published: 'bg-success/15 text-success', draft: 'bg-secondary text-muted-foreground', archived: 'bg-muted text-muted-foreground line-through'
  };

  // Recherche instantanée (bind local pour garder le focus/la valeur pendant la navigation)
  let q = $state(untrack(() => data.q ?? ''));
  let timer: ReturnType<typeof setTimeout>;

  function nav(params: Record<string, string | number | undefined>) {
    const merged: Record<string, string | number | undefined> = {
      q, status: data.status, sort: data.sort, dir: data.dir, page: data.page, ...params
    };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === '' || (k === 'sort' && v === 'recent') || (k === 'page' && v === 1)) continue;
      sp.set(k, String(v));
    }
    const s = sp.toString();
    goto(`/admin/catalogue${s ? `?${s}` : ''}`, { keepFocus: true, replaceState: true, noScroll: true });
  }

  function onSearch() {
    clearTimeout(timer);
    timer = setTimeout(() => nav({ q, page: 1 }), 220);
  }
  function sortBy(col: string) {
    const dir = data.sort === col && data.dir === 'asc' ? 'desc' : 'asc';
    nav({ sort: col, dir, page: 1 });
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

<div class="mb-4 flex flex-wrap gap-2">
  <div class="relative min-w-[240px] flex-1">
    <MagnifyingGlass size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input bind:value={q} oninput={onSearch} placeholder="Rechercher un titre…" autocomplete="off"
      class="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
  </div>
  <select value={data.status ?? ''} onchange={(e) => nav({ status: e.currentTarget.value || undefined, page: 1 })}
    class="h-10 rounded-md border border-border bg-background px-3 text-sm">
    <option value="">Tous les statuts</option>
    {#each Object.entries(STATUS) as [k, v] (k)}<option value={k}>{v}</option>{/each}
  </select>
</div>

{#snippet sortable(label: string, col: string, align = 'left')}
  <th class="px-3 py-2 font-medium" style="text-align:{align}">
    <button type="button" onclick={() => sortBy(col)} class="inline-flex items-center gap-1 uppercase hover:text-foreground {align === 'right' ? 'flex-row-reverse' : ''} {data.sort === col ? 'text-foreground' : ''}">
      {label}
      {#if data.sort === col}
        {#if data.dir === 'asc'}<CaretUp size={11} weight="bold" />{:else}<CaretDown size={11} weight="bold" />{/if}
      {:else}
        <CaretDown size={11} class="opacity-25" />
      {/if}
    </button>
  </th>
{/snippet}

<div class="overflow-x-auto rounded-lg border border-border bg-card">
  <table class="w-full text-sm">
    <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
      <tr>
        {@render sortable('Livre', 'title')}
        {@render sortable('Statut', 'status')}
        {@render sortable('ISBN', 'isbn')}
        {@render sortable('Parution', 'date')}
        {@render sortable('Prix', 'price', 'right')}
        <th class="px-3 py-2 font-medium">Ebook</th>
        {@render sortable('Stock', 'stock', 'right')}
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each data.books as b (b.id)}
        {@const etat = bookDerivedState(b)}
        <tr class="cursor-pointer hover:bg-muted/30" onclick={(e) => { if (!(e.target as HTMLElement).closest('a,button')) goto(`/admin/catalogue/${nu(b.id)}`); }}>
          <td class="px-3 py-2.5">
            <a href="/admin/catalogue/{nu(b.id)}" class="flex items-center gap-3">
              <span class="h-16 w-11 shrink-0 overflow-hidden rounded border border-border bg-muted">
                {#if b.cover_url}<img src={b.cover_url} alt="" class="size-full object-cover" />{/if}
              </span>
              <span class="min-w-0">
                <span class="block font-display text-lg font-semibold leading-tight hover:text-link">{b.title}</span>
                {#if b.subtitle}<span class="mt-0.5 block text-sm leading-snug text-muted-foreground">{b.subtitle}</span>{/if}
                {#if b.authors?.length}<span class="mt-0.5 block text-xs uppercase tracking-wide text-foreground/70">{b.authors.join(', ')}</span>{/if}
              </span>
            </a>
          </td>
          <td class="px-3 py-2">
            <span class="whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium {STATUT_CLS[b.status] ?? 'bg-secondary'}">{BOOK_STATUS_LABEL[b.status] ?? b.status}</span>
            {#if etat}<div class="mt-1 whitespace-nowrap text-[11px] font-medium {etat === 'Épuisé' ? 'text-destructive' : 'text-warning'}">{etat}</div>{/if}
          </td>
          <td class="px-3 py-2 font-mono text-xs text-muted-foreground">{b.isbn_paper ?? '—'}</td>
          <td class="whitespace-nowrap px-3 py-2 text-muted-foreground">{dateFr(b.published_at)}</td>
          <td class="whitespace-nowrap px-3 py-2 text-right">{euro(b.price_paper)}</td>
          <td class="px-3 py-2">
            {#if b.ebook_formats?.length}
              <span class="whitespace-nowrap text-xs font-medium uppercase">{[...new Set(b.ebook_formats)].join(' · ')}</span>
              {#if b.price_ebook != null}<div class="whitespace-nowrap text-xs text-muted-foreground">{euro(b.price_ebook)}</div>{/if}
            {:else if b.price_ebook != null}
              <span class="whitespace-nowrap text-xs text-warning" title="Prix ebook renseigné mais aucun fichier">sans fichier</span>
            {:else}<span class="text-muted-foreground">—</span>{/if}
          </td>
          <td class="px-3 py-2 text-right {b.stock_qty > 0 ? '' : 'text-destructive'}">{b.stock_qty}</td>
        </tr>
      {/each}
      {#if data.books.length === 0}
        <tr><td colspan="7" class="px-3 py-10 text-center text-muted-foreground">Aucun livre ne correspond.</td></tr>
      {/if}
    </tbody>
  </table>
</div>

<Pagination page={data.page} {pageCount} onpage={(p) => nav({ page: p })} />
