<script lang="ts">
  import Icon from '$lib/components/Icon.svelte';
  import { ORDER_STATUS_LABEL, euros } from '$lib/labels';
  import { Receipt, CurrencyEur, Clock, Truck } from 'phosphor-svelte';

  let { data } = $props();
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—');

  const kpis = $derived([
    { label: 'Commandes', value: data.stats.orders, icon: Receipt, href: '/admin/commandes' },
    { label: "Chiffre d'affaires", value: euros(data.stats.revenue) ?? '0 €', icon: CurrencyEur, href: '/admin/commandes' },
    { label: 'En attente', value: data.stats.pending, icon: Clock, href: '/admin/commandes?status=pending' },
    { label: 'À expédier', value: data.stats.toShip, icon: Truck, href: '/admin/commandes?status=paid' }
  ]);

  const catalogueStats = $derived([
    { label: 'Livres publiés', value: data.counts.books, href: '/admin/catalogue' },
    { label: 'À paraître', value: data.counts.forthcoming, href: '/admin/catalogue?status=forthcoming' },
    { label: 'Auteurs', value: data.counts.authors, href: '/admin/auteurs' },
    { label: 'Articles', value: data.counts.articles, href: '/admin/contenu' },
    { label: 'Rencontres à venir', value: data.counts.events, href: '/admin/catalogue' }
  ]);

  const statusTone: Record<string, string> = {
    pending: 'bg-warning/15 text-warning', paid: 'bg-success/15 text-success',
    processing: 'bg-accent text-accent-foreground', sent_to_bl: 'bg-accent text-accent-foreground',
    completed: 'bg-success/15 text-success', cancelled: 'bg-muted text-muted-foreground',
    refunded: 'bg-muted text-muted-foreground', failed: 'bg-destructive/10 text-destructive'
  };
</script>

<svelte:head><title>Tableau de bord · Admin Agone</title></svelte:head>

<div class="mb-6">
  <p class="eyebrow">Tableau de bord</p>
  <h2 class="mt-1 text-xl font-bold">Bonjour {data.user.first_name || data.user.email} 👋</h2>
</div>

<!-- KPIs commandes -->
<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
  {#each kpis as k (k.label)}
    <a href={k.href} class="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary">
      <div class="flex items-center justify-between">
        <span class="text-sm text-muted-foreground">{k.label}</span>
        <span class="grid size-8 place-items-center rounded-md bg-accent text-link"><k.icon size={16} /></span>
      </div>
      <div class="mt-2 text-2xl font-bold tabular-nums">{k.value}</div>
    </a>
  {/each}
</div>

<!-- Catalogue en bref -->
<div class="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
  {#each catalogueStats as c (c.label)}
    <a href={c.href} class="rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary">
      <div class="text-xl font-bold tabular-nums">{c.value}</div>
      <div class="text-xs text-muted-foreground">{c.label}</div>
    </a>
  {/each}
</div>

<!-- Dernières commandes -->
<div class="mt-8">
  <div class="mb-3 flex items-center justify-between">
    <h3 class="text-base font-semibold">Dernières commandes</h3>
    <a href="/admin/commandes" class="text-sm text-link hover:underline">Toutes les commandes →</a>
  </div>
  <div class="overflow-x-auto rounded-lg border border-border bg-card">
    <table class="w-full text-sm">
      <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
        <tr>
          <th class="px-3 py-2 font-medium">N°</th>
          <th class="px-3 py-2 font-medium">Client</th>
          <th class="px-3 py-2 font-medium">Statut</th>
          <th class="px-3 py-2 text-right font-medium">Total</th>
          <th class="px-3 py-2 text-right font-medium">Date</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        {#each data.recentOrders as o (o.number)}
          <tr class="hover:bg-muted/30">
            <td class="px-3 py-2"><a href="/admin/commandes/{o.number}" class="font-medium hover:text-link">#{o.number}</a></td>
            <td class="px-3 py-2 text-muted-foreground">{o.customer_name || o.customer_email || o.email || 'Invité'}</td>
            <td class="px-3 py-2"><span class="rounded px-2 py-0.5 text-xs font-medium {statusTone[o.status] ?? 'bg-secondary'}">{ORDER_STATUS_LABEL[o.status] ?? o.status}</span></td>
            <td class="px-3 py-2 text-right tabular-nums">{euros(o.total)}</td>
            <td class="px-3 py-2 text-right text-muted-foreground">{dateFr(o.created_at)}</td>
          </tr>
        {/each}
        {#if data.recentOrders.length === 0}
          <tr><td colspan="5" class="px-3 py-10 text-center text-muted-foreground">Aucune commande pour l'instant.</td></tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>
