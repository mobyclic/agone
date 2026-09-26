<script lang="ts">
  import { ArrowLeft, MagnifyingGlass, CaretUp, CaretDown, CaretRight } from 'phosphor-svelte';
  import ResumeVentesLivre from '$lib/components/ResumeVentesLivre.svelte';
  let { data } = $props();

  /** Livre déplié sous sa ligne : le résumé de ses ventes. */
  let ouvert = $state<string | null>(null);
  const bascule = (id: string) => (ouvert = ouvert === id ? null : id);

  type Col = 'title' | 'date' | 'author' | 'contributor' | 'editor' | 'contract';
  const parution = (d?: string) =>
    d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  let sortCol = $state<Col>('title');
  let sortDir = $state<'asc' | 'desc'>('asc');
  function sortBy(col: Col) {
    if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    // Un titre se lit de A à Z, un nombre et une date du plus grand au plus petit.
    else { sortCol = col; sortDir = col === 'title' ? 'asc' : 'desc'; }
  }
  const val = (b: any, col: Col) =>
    // Sans date de parution, le livre part en fin de liste dans les deux sens.
    col === 'date' ? (b.published_at ? +new Date(b.published_at) : 0)
    : col === 'author' ? b.author_count
    : col === 'contributor' ? b.contributor_count
    : col === 'editor' ? b.editor_count
    : col === 'contract' ? b.contract_total
    : 0;
  const sorted = $derived(
    [...data.books].sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      if (sortCol === 'title') return mul * String(a.title).localeCompare(String(b.title), 'fr');
      return mul * ((val(a, sortCol) ?? 0) - (val(b, sortCol) ?? 0));
    })
  );
</script>

<svelte:head><title>Contrats de droits · Admin</title></svelte:head>

<a href="/admin/droits" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Droits d’auteur</a>
<h2 class="text-xl font-bold">Contrats par livre</h2>
<p class="mb-4 text-sm text-muted-foreground">Cliquez sur un livre pour voir ses contrats, ses ventes et ses mouvements de stock.</p>

<form method="GET" class="mb-4 max-w-md">
  <div class="relative">
    <MagnifyingGlass size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input name="q" value={data.q ?? ''} placeholder="Rechercher un livre…" class="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
  </div>
</form>

{#snippet sortable(label: string, col: Col, align = 'left')}
  <th class="px-3 py-2 font-medium" style="text-align:{align}">
    <button type="button" onclick={() => sortBy(col)} class="inline-flex items-center gap-1 uppercase hover:text-foreground {align === 'right' ? 'flex-row-reverse' : ''} {sortCol === col ? 'text-foreground' : ''}">
      {label}
      {#if sortCol === col}
        {#if sortDir === 'asc'}<CaretUp size={11} weight="bold" />{:else}<CaretDown size={11} weight="bold" />{/if}
      {:else}<CaretDown size={11} class="opacity-25" />{/if}
    </button>
  </th>
{/snippet}

<div class="overflow-x-auto rounded-lg border border-border bg-card">
  <table class="w-full text-sm">
    <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
      <tr>
        <th class="w-10 px-3 py-2"></th>
        {@render sortable('Livre', 'title')}
        {@render sortable('Parution', 'date')}
        {@render sortable('Auteurs', 'author', 'right')}
        {@render sortable('Contributeurs', 'contributor', 'right')}
        {@render sortable('Éditeurs', 'editor', 'right')}
        {@render sortable('Contrats', 'contract', 'right')}
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each sorted as b (b.id)}
        {@const id = String(b.id).replace('book:', '')}
        <tr class="cursor-pointer hover:bg-muted/30 {ouvert === id ? 'bg-muted/40' : ''}" onclick={() => bascule(id)}
          tabindex="0" role="button" aria-expanded={ouvert === id} aria-label="Ventes de {b.title}"
          onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bascule(id); } }}>
          <td class="py-1.5 pl-3">
            <span class="block w-9 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
              {#if b.cover_url}
                <img src={b.cover_url} alt="" loading="lazy" class="block aspect-[2/3] w-full object-cover" />
              {:else}
                <span class="block aspect-[2/3] w-full bg-ink"></span>
              {/if}
            </span>
          </td>
          <td class="px-3 py-2 font-medium">
            <span class="inline-flex items-center gap-1.5">
              <CaretRight size={12} weight="bold" class="shrink-0 text-muted-foreground transition-transform {ouvert === id ? 'rotate-90' : ''}" />
              {b.title}
            </span>
          </td>
          <td class="whitespace-nowrap px-3 py-2 text-muted-foreground">{parution(b.published_at)}</td>
          <td class="px-3 py-2 text-right tabular-nums {b.author_count ? '' : 'text-muted-foreground'}">{b.author_count}</td>
          <td class="px-3 py-2 text-right tabular-nums {b.contributor_count ? '' : 'text-muted-foreground'}">{b.contributor_count}</td>
          <td class="px-3 py-2 text-right tabular-nums {b.editor_count ? '' : 'text-muted-foreground'}">{b.editor_count}</td>
          <td class="px-3 py-2 text-right tabular-nums">
            {#if b.contract_total === 0}
              <span class="text-muted-foreground">0</span>
            {:else if b.contract_active === b.contract_total}
              <span class="text-success" title="Tous actifs">{b.contract_total}</span>
            {:else}
              <span class="text-warning" title="{b.contract_active} actif(s) sur {b.contract_total} contrat(s) — le reste est en brouillon ou terminé">{b.contract_active}/{b.contract_total}</span>
            {/if}
          </td>
        </tr>
        {#if ouvert === id}
          <tr><td colspan="7" class="p-0"><ResumeVentesLivre bookId={id} /></td></tr>
        {/if}
      {/each}
      {#if sorted.length === 0}
        <tr><td colspan="7" class="px-3 py-10 text-center text-muted-foreground">Aucun livre.</td></tr>
      {/if}
    </tbody>
  </table>
</div>
