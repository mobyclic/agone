<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Plus, MagnifyingGlass, CaretUp, CaretDown } from 'phosphor-svelte';

  let { data } = $props();
  const pageCount = $derived(Math.max(1, Math.ceil(data.total / data.limit)));
  function qs(p: Record<string, string | number | undefined>) {
    const base = {
      q: data.q,
      sort: data.sort === 'name' ? undefined : data.sort,
      dir: data.dir === 'asc' ? undefined : data.dir
    };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...base, ...p })) if (v !== undefined && v !== '') sp.set(k, String(v));
    const s = sp.toString(); return s ? `?${s}` : '';
  }
  // Clique sur un en-tête : même colonne → bascule ASC/DESC ; autre colonne → ASC.
  const sortHref = (col: 'name' | 'titres' | 'visibilite') =>
    qs({ sort: col, dir: data.sort === col && data.dir === 'asc' ? 'desc' : 'asc', page: undefined });
</script>

{#snippet th(col: 'name' | 'titres' | 'visibilite', text: string, right = false)}
  <th class="px-3 py-2 font-medium {right ? 'text-right' : ''}">
    <a href={sortHref(col)} class="inline-flex items-center gap-1 hover:text-foreground {right ? 'flex-row-reverse' : ''} {data.sort === col ? 'text-foreground' : ''}">
      {text}
      {#if data.sort === col}
        {#if data.dir === 'asc'}<CaretUp size={11} weight="bold" />{:else}<CaretDown size={11} weight="bold" />{/if}
      {:else}
        <CaretDown size={11} class="opacity-25" />
      {/if}
    </a>
  </th>
{/snippet}

<svelte:head><title>Auteurs · Admin Agone</title></svelte:head>

<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
  <div><h2 class="text-xl font-bold">Auteurs</h2><p class="text-sm text-muted-foreground">{data.total} contributeurs</p></div>
  <Button href="/admin/auteurs/nouveau"><Plus size={16} /> Nouvel auteur</Button>
</div>

<form method="GET" class="mb-4 max-w-md">
  <div class="relative">
    <MagnifyingGlass size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input name="q" value={data.q ?? ''} placeholder="Rechercher un auteur…" class="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
  </div>
</form>

<div class="overflow-x-auto rounded-lg border border-border bg-card">
  <table class="w-full text-sm">
    <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
      <tr>{@render th('name', 'Nom')}{@render th('titres', 'Titres', true)}{@render th('visibilite', 'Visibilité')}</tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each data.authors as a (a.id)}
        <tr class="hover:bg-muted/30">
          <td class="px-3 py-2"><a href="/admin/auteurs/{a.slug}" class="font-medium hover:text-link">{a.full_name}</a></td>
          <td class="px-3 py-2 text-right text-muted-foreground">{a.book_count}</td>
          <td class="px-3 py-2">{#if a.hidden}<span class="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">Masqué</span>{:else}<span class="text-xs text-success">Visible</span>{/if}</td>
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
