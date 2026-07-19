<script lang="ts">
  import { ArrowLeft, MagnifyingGlass, CaretUp, CaretDown } from 'phosphor-svelte';
  let { data } = $props();

  type Col = 'title' | 'author' | 'contributor' | 'editor' | 'contract';
  let sortCol = $state<Col>('title');
  let sortDir = $state<'asc' | 'desc'>('asc');
  function sortBy(col: Col) {
    if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortCol = col; sortDir = col === 'title' ? 'asc' : 'desc'; }
  }
  const val = (b: any, col: Col) =>
    col === 'author' ? b.author_count
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
<p class="mb-4 text-sm text-muted-foreground">Sélectionnez un livre pour définir les contrats de ses contributeurs.</p>

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
        {@render sortable('Livre', 'title')}
        {@render sortable('Auteurs', 'author', 'right')}
        {@render sortable('Contributeurs', 'contributor', 'right')}
        {@render sortable('Éditeurs', 'editor', 'right')}
        {@render sortable('Contrats', 'contract', 'right')}
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each sorted as b (b.id)}
        <tr class="hover:bg-muted/30">
          <td class="px-3 py-2"><a href="/admin/droits/contrats/{String(b.id).replace('book:', '')}" class="font-medium hover:text-link">{b.title}</a></td>
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
      {/each}
      {#if sorted.length === 0}
        <tr><td colspan="5" class="px-3 py-10 text-center text-muted-foreground">Aucun livre.</td></tr>
      {/if}
    </tbody>
  </table>
</div>
