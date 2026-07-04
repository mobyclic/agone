<script lang="ts">
  import { Receipt } from 'phosphor-svelte';
  import { Button } from '$lib/components/ui/button';
  let { data } = $props();
  const eur = (n: number) => `${(n ?? 0).toFixed(2).replace('.', ',')} €`;
  const fmt = (s: string) => new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  const STATUS: Record<string, string> = { pending: 'En attente', paid: 'Payée', processing: 'En préparation', sent_to_bl: 'Expédiée', completed: 'Terminée', cancelled: 'Annulée', refunded: 'Remboursée', failed: 'Échouée' };
</script>

<svelte:head><title>Mes commandes · Agone</title></svelte:head>

<h2 class="text-xl font-bold">Mes commandes</h2>

{#if data.orders.length === 0}
  <div class="mt-6 rounded-lg border border-border bg-card p-10 text-center">
    <Receipt size={32} class="mx-auto text-muted-foreground" />
    <p class="mt-3 text-muted-foreground">Aucune commande pour le moment.</p>
    <Button href="/catalogue" variant="brand" class="mt-4">Parcourir le catalogue</Button>
  </div>
{:else}
  <div class="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
    <table class="w-full text-sm">
      <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
        <tr><th class="px-3 py-2 font-medium">N°</th><th class="px-3 py-2 font-medium">Date</th><th class="px-3 py-2 font-medium">Statut</th><th class="px-3 py-2 text-right font-medium">Total</th></tr>
      </thead>
      <tbody class="divide-y divide-border">
        {#each data.orders as o (o.id)}
          <tr class="hover:bg-muted/30">
            <td class="px-3 py-2"><a href="/commande/{o.number}" class="font-medium hover:text-link">n°{o.number}</a></td>
            <td class="px-3 py-2 text-muted-foreground">{fmt(o.created_at)}</td>
            <td class="px-3 py-2"><span class="rounded bg-secondary px-2 py-0.5 text-xs">{STATUS[o.status] ?? o.status}</span></td>
            <td class="px-3 py-2 text-right font-semibold">{eur(o.total)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
