<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import Pagination from '$lib/components/Pagination.svelte';
  import { Plus, MagnifyingGlass, CaretUp, CaretDown } from 'phosphor-svelte';

  let { data } = $props();
  const pageCount = $derived(Math.max(1, Math.ceil(data.total / data.limit)));
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  const futur = (s?: string) => !!s && new Date(s).getTime() > Date.now();
  /** Bascule optimiste : l'interrupteur change tout de suite, la liste se recharge ensuite. */
  let enCours = $state<Record<string, string>>({});

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
        {@render sortTh('date', 'Date')}
        {@render sortTh('title', 'Titre')}
        <th class="px-3 py-2 font-medium">Catégorie</th>
        {@render sortTh('status', 'Publié')}
        {@render sortTh('views', 'Vues', true)}
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each data.articles as a (a.id)}
        {@const statut = enCours[a.id] ?? a.status}
        {@const publie = statut === 'published'}
        <tr class="cursor-pointer hover:bg-muted/30" onclick={(e) => { if (!(e.target as HTMLElement).closest('a,button,form')) goto(`/admin/articles/${a.id}`); }}>
          <td class="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
            {dateFr(a.published_at)}
            {#if publie && futur(a.published_at)}<div class="text-[11px] font-medium text-warning">programmé</div>{/if}
          </td>
          <td class="px-3 py-2">
            <a href="/admin/articles/{a.id}" class="font-medium hover:text-link">{a.title}</a>
            {#if a.is_newsletter_issue}<span class="ml-1.5 rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">LettrInfo</span>{/if}
            {#if a.author}<div class="text-xs text-muted-foreground">{a.author}</div>{/if}
          </td>
          <td class="px-3 py-2 text-muted-foreground">{a.rubrique_name ?? '—'}</td>
          <td class="px-3 py-2">
            <form method="POST" action="?/statut" use:enhance={() => {
              enCours[a.id] = publie ? 'draft' : 'published';
              return async ({ update }) => { await update({ reset: false, invalidateAll: true }); delete enCours[a.id]; };
            }}>
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="status" value={publie ? 'draft' : 'published'} />
              <button type="submit" role="switch" aria-checked={publie} title={publie ? 'Publié — cliquer pour repasser en brouillon' : 'Brouillon — cliquer pour publier'}
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors {publie ? 'bg-success' : 'bg-muted-foreground/30'}">
                <span class="inline-block size-4 rounded-full bg-white shadow transition-transform {publie ? 'translate-x-[18px]' : 'translate-x-0.5'}"></span>
                <span class="sr-only">{publie ? 'Publié' : 'Brouillon'}</span>
              </button>
            </form>
          </td>
          <td class="px-3 py-2 text-right tabular-nums text-muted-foreground">{a.views ? a.views.toLocaleString('fr-FR') : '—'}</td>
        </tr>
      {/each}
      {#if data.articles.length === 0}
        <tr><td colspan="5" class="px-3 py-10 text-center text-muted-foreground">Aucun article.</td></tr>
      {/if}
    </tbody>
  </table>
</div>

<Pagination page={data.page} {pageCount} onpage={(p) => nav({ page: p })} />
