<script lang="ts">
  import { ArrowLeft, MagnifyingGlass, CaretUp, CaretDown, CaretRight, FileArrowUp } from 'phosphor-svelte';
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
  // Trier sur la couverture : les livres à contrats manquants d'abord.
  const manque = (signes: number, total: number) => (total ? (signes >= total ? 2 : signes ? 1 : 0) : 3);
  const val = (b: any, col: Col) =>
    // Sans date de parution, le livre part en fin de liste dans les deux sens.
    col === 'date' ? (b.published_at ? +new Date(b.published_at) : 0)
    : col === 'author' ? manque(b.author_signed, b.author_count)
    : col === 'contributor' ? manque(b.contributor_signed, b.contributor_count)
    : col === 'editor' ? manque(b.editor_signed, b.editor_count)
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
<p class="mb-4 text-sm text-muted-foreground">
  Cliquez sur un livre pour voir ses ventes. Les colonnes indiquent, par rôle, le nombre de contributeurs ayant un
  contrat validé — « 1/1 » signifie couvert, « +1 » un contrat encore en brouillon.
</p>

<div class="mb-4 flex flex-wrap items-center gap-3">
  <a href="/admin/droits/contrats/analyser" class="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-link">
    <FileArrowUp size={15} /> Lire un contrat déposé
  </a>
</div>

<form method="GET" class="mb-4 max-w-md">
  <div class="relative">
    <MagnifyingGlass size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input name="q" value={data.q ?? ''} placeholder="Rechercher un livre…" class="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
  </div>
</form>

<!-- « 1/1 » : un contrat validé pour l'unique contributeur de ce rôle. Les
     brouillons sont comptés à part : ils n'ouvrent droit à rien. -->
{#snippet couverture(signes: number, brouillons: number, total: number)}
  {#if !total}
    <span class="text-muted-foreground/50">—</span>
  {:else}
    <span class={signes >= total ? 'text-success' : signes ? 'text-warning' : 'text-muted-foreground'}
      title="{signes} contrat(s) validé(s) sur {total} contributeur(s){brouillons ? ` · ${brouillons} en brouillon` : ''}">
      {signes}/{total}
    </span>
    {#if brouillons}<span class="ml-1 text-xs text-muted-foreground" title="{brouillons} contrat(s) en brouillon">+{brouillons}</span>{/if}
  {/if}
{/snippet}

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
          <td class="px-3 py-2 text-right tabular-nums">{@render couverture(b.author_signed, b.author_draft, b.author_count)}</td>
          <td class="px-3 py-2 text-right tabular-nums">{@render couverture(b.contributor_signed, b.contributor_draft, b.contributor_count)}</td>
          <td class="px-3 py-2 text-right tabular-nums">{@render couverture(b.editor_signed, b.editor_draft, b.editor_count)}</td>
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
