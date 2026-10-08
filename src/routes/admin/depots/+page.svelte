<script lang="ts">
  /**
   * Dépôts : les clients marqués « dépositaire », avec le stock qu'on leur a
   * confié. Tout se passe dans la fiche d'un dépôt (stock, inventaire, réassort,
   * carnets de vente) ; un dépositaire se crée depuis sa fiche client.
   */
  import { Package, ArrowRight } from 'phosphor-svelte';
  let { data } = $props();
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
</script>

<svelte:head><title>Dépôts · Admin Agone</title></svelte:head>

<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">Dépôts</h2>
    <p class="text-sm text-muted-foreground">Exemplaires confiés à des dépositaires, vendus pour Agone. Remise par défaut : {data.remiseDefaut} %.</p>
  </div>
  <a href="/admin/clients?kind=" class="text-sm text-link underline-offset-4 hover:underline">Marquer un client comme dépositaire →</a>
</div>

{#if data.depots.length === 0}
  <div class="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
    <Package size={28} class="mx-auto mb-2 opacity-50" />
    Aucun dépositaire. Ouvrez la fiche d'un client professionnel et cochez « Dépositaire ».
  </div>
{:else}
  <div class="overflow-x-auto rounded-lg border border-border bg-card">
    <table class="w-full text-sm">
      <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
        <tr>
          <th class="px-3 py-2 font-medium">Dépositaire</th>
          <th class="px-3 py-2 text-right font-medium">Titres</th>
          <th class="px-3 py-2 text-right font-medium">Exemplaires</th>
          <th class="px-3 py-2 text-right font-medium">Remise</th>
          <th class="px-3 py-2 font-medium">Dernier carnet</th>
          <th class="px-3 py-2"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        {#each data.depots as d (d.id)}
          <tr class="hover:bg-muted/30">
            <td class="px-3 py-2.5">
              <a href="/admin/depots/{d.id}" class="font-medium hover:text-link">{d.name}</a>
              <div class="text-xs text-muted-foreground">{[d.contact_name, d.city].filter(Boolean).join(' · ')}</div>
            </td>
            <td class="px-3 py-2.5 text-right">{d.titres}</td>
            <td class="px-3 py-2.5 text-right font-medium">{d.stock_total}</td>
            <td class="px-3 py-2.5 text-right">{d.remise_effective} %</td>
            <td class="px-3 py-2.5 text-muted-foreground">{dateFr(d.dernier_carnet)}</td>
            <td class="px-3 py-2.5 text-right"><a href="/admin/depots/{d.id}" class="inline-flex items-center gap-1 text-xs text-link hover:underline">Ouvrir <ArrowRight size={12} /></a></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
