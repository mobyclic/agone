<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Plus, MagnifyingGlass } from 'phosphor-svelte';

  let { data } = $props();
  const pageCount = $derived(Math.max(1, Math.ceil(data.total / data.limit)));
  function qs(p: Record<string, string | number | undefined>) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: data.q, ...p })) if (v !== undefined && v !== '') sp.set(k, String(v));
    const s = sp.toString(); return s ? `?${s}` : '';
  }
</script>

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
      <tr><th class="px-3 py-2 font-medium">Nom</th><th class="px-3 py-2 text-right font-medium">Titres</th><th class="px-3 py-2 font-medium">Visibilité</th></tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each data.authors as a (a.id)}
        <tr class="hover:bg-muted/30">
          <td class="px-3 py-2"><a href="/admin/auteurs/{String(a.id).replace('author:', '')}" class="font-medium hover:text-primary">{a.full_name}</a></td>
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
