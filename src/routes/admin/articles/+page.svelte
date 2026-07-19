<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import { Plus, MagnifyingGlass, CaretUp, CaretDown } from 'phosphor-svelte';
  import { CONTENT_STATUS_LABEL } from '$lib/labels';

  let { data } = $props();
  const pageCount = $derived(Math.max(1, Math.ceil(data.total / data.limit)));
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

  let q = $state(untrack(() => data.q ?? ''));
  let timer: ReturnType<typeof setTimeout>;
  function nav(params: Record<string, string | number | undefined>) {
    const merged: Record<string, string | number | undefined> = {
      q, status: data.status, rubrique: data.rubrique, sort: data.sort, dir: data.dir, page: data.page, ...params
    };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === '' || (k === 'page' && v === 1) || (k === 'sort' && v === 'date') || (k === 'dir' && v === 'desc')) continue;
      sp.set(k, String(v));
    }
    const s = sp.toString();
    goto(`/admin/articles${s ? `?${s}` : ''}`, { keepFocus: true, replaceState: true, noScroll: true });
  }
  function onSearch() {
    clearTimeout(timer);
    timer = setTimeout(() => nav({ q, page: 1 }), 220);
  }
  function sortBy(col: 'title' | 'status' | 'views' | 'date') {
    const dir = data.sort === col ? (data.dir === 'asc' ? 'desc' : 'asc') : (col === 'title' || col === 'status' ? 'asc' : 'desc');
    nav({ sort: col, dir, page: 1 });
  }
</script>

<svelte:head><title>Articles · Admin Agone</title></svelte:head>

{#snippet sortTh(col: 'title' | 'status' | 'views' | 'date', text: string, right = false)}
  <th class="px-3 py-2 font-medium {right ? 'text-right' : ''}">
    <button type="button" onclick={() => sortBy(col)} class="inline-flex items-center gap-1 hover:text-foreground {right ? 'flex-row-reverse' : ''} {data.sort === col ? 'text-foreground' : ''}">
      {text}
      {#if data.sort === col}
        {#if data.dir === 'asc'}<CaretUp size={11} weight="bold" />{:else}<CaretDown size={11} weight="bold" />{/if}
      {:else}<CaretDown size={11} class="opacity-25" />{/if}
    </button>
  </th>
{/snippet}

<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">Articles</h2>
    <p class="text-sm text-muted-foreground">{data.total} article{data.total > 1 ? 's' : ''}</p>
  </div>
  <Button href="/admin/articles/nouveau"><Plus size={16} /> Nouvel article</Button>
</div>

<div class="mb-4 flex flex-wrap gap-2">
  <div class="relative min-w-[200px] flex-1">
    <MagnifyingGlass size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input bind:value={q} oninput={onSearch} placeholder="Rechercher un titre…" autocomplete="off"
      class="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
  </div>
  <select value={data.status ?? ''} onchange={(e) => nav({ status: e.currentTarget.value || undefined, page: 1 })}
    class="h-10 rounded-md border border-border bg-background px-3 text-sm">
    <option value="">Tous les statuts</option>
    <option value="published">Publiés</option>
    <option value="draft">Brouillons</option>
  </select>
  <select value={data.rubrique ?? ''} onchange={(e) => nav({ rubrique: e.currentTarget.value || undefined, page: 1 })}
    class="h-10 rounded-md border border-border bg-background px-3 text-sm">
    <option value="">Toutes catégories</option>
    {#each data.rubriques as r (r.id)}<option value={r.slug}>{r.name}</option>{/each}
  </select>
</div>

<div class="overflow-x-auto rounded-lg border border-border bg-card">
  <table class="w-full text-sm">
    <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
      <tr>
        {@render sortTh('title', 'Titre')}
        <th class="px-3 py-2 font-medium">Catégorie</th>
        {@render sortTh('status', 'Statut')}
        {@render sortTh('views', 'Vues', true)}
        {@render sortTh('date', 'Date', true)}
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each data.articles as a (a.id)}
        <tr class="hover:bg-muted/30">
          <td class="px-3 py-2">
            <a href="/admin/articles/{a.id}" class="font-medium hover:text-link">{a.title}</a>
            {#if a.is_newsletter_issue}<span class="ml-1.5 rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">LettrInfo</span>{/if}
            {#if a.author}<div class="text-xs text-muted-foreground">{a.author}</div>{/if}
          </td>
          <td class="px-3 py-2 text-muted-foreground">{a.rubrique_name ?? '—'}</td>
          <td class="px-3 py-2">
            <span class="rounded px-2 py-0.5 text-xs font-medium {a.status === 'published' ? 'bg-success/15 text-success' : 'bg-secondary text-muted-foreground'}">{CONTENT_STATUS_LABEL[a.status] ?? a.status}</span>
          </td>
          <td class="px-3 py-2 text-right tabular-nums text-muted-foreground">{a.views ? a.views.toLocaleString('fr-FR') : '—'}</td>
          <td class="px-3 py-2 text-right text-muted-foreground">{dateFr(a.published_at)}</td>
        </tr>
      {/each}
      {#if data.articles.length === 0}
        <tr><td colspan="5" class="px-3 py-10 text-center text-muted-foreground">Aucun article.</td></tr>
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
