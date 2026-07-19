<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Plus, Globe } from 'phosphor-svelte';

  let { data } = $props();
  const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
</script>

<svelte:head><title>Livraison · Admin Agone</title></svelte:head>

<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">Livraison</h2>
    <p class="text-sm text-muted-foreground">Zones de destination et tarifs au poids.</p>
  </div>
  <Button href="/admin/livraison/nouvelle"><Plus size={16} /> Nouvelle zone</Button>
</div>

<div class="overflow-x-auto rounded-lg border border-border bg-card">
  <table class="w-full text-sm">
    <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
      <tr>
        <th class="px-3 py-2 font-medium">Zone</th>
        <th class="px-3 py-2 font-medium">Pays</th>
        <th class="px-3 py-2 text-right font-medium">Paliers</th>
        <th class="px-3 py-2 text-right font-medium">Franco</th>
        <th class="px-3 py-2 font-medium">État</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each data.zones as z (z.id)}
        <tr class="hover:bg-muted/30">
          <td class="px-3 py-2"><a href="/admin/livraison/{z.id}" class="font-medium hover:text-link">{z.name}</a></td>
          <td class="px-3 py-2 text-muted-foreground">
            {#if z.rest_of_world}<span class="inline-flex items-center gap-1"><Globe size={14} /> Reste du monde</span>
            {:else}{z.country_count} pays{/if}
          </td>
          <td class="px-3 py-2 text-right tabular-nums text-muted-foreground">{z.rate_count}</td>
          <td class="px-3 py-2 text-right text-muted-foreground">{z.free_over != null ? `dès ${eur(z.free_over)}` : '—'}</td>
          <td class="px-3 py-2">
            {#if z.active}<span class="rounded bg-success/15 px-2 py-0.5 text-xs text-success">Active</span>
            {:else}<span class="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">Inactive</span>{/if}
          </td>
        </tr>
      {/each}
      {#if data.zones.length === 0}
        <tr><td colspan="5" class="px-3 py-10 text-center text-muted-foreground">Aucune zone de livraison. Créez-en une pour activer les expéditions.</td></tr>
      {/if}
    </tbody>
  </table>
</div>
