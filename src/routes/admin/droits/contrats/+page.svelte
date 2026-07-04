<script lang="ts">
  import { ArrowLeft, MagnifyingGlass } from 'phosphor-svelte';
  let { data } = $props();
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

<div class="overflow-x-auto rounded-lg border border-border bg-card">
  <table class="w-full text-sm">
    <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
      <tr><th class="px-3 py-2 font-medium">Livre</th><th class="px-3 py-2 text-right font-medium">Contributeurs</th><th class="px-3 py-2 text-right font-medium">Contrats</th></tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each data.books as b (b.id)}
        <tr class="hover:bg-muted/30">
          <td class="px-3 py-2"><a href="/admin/droits/contrats/{String(b.id).replace('book:', '')}" class="font-medium hover:text-link">{b.title}</a></td>
          <td class="px-3 py-2 text-right text-muted-foreground">{b.contributor_count}</td>
          <td class="px-3 py-2 text-right">
            {#if b.contract_count >= b.contributor_count}<span class="text-success">{b.contract_count}</span>
            {:else if b.contract_count > 0}<span class="text-warning">{b.contract_count}</span>
            {:else}<span class="text-muted-foreground">0</span>{/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
