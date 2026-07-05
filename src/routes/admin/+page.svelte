<script lang="ts">
  import { ORDER_STATUS_LABEL, euros } from '$lib/labels';

  let { data } = $props();
  const eur = (n: number) => euros(n) ?? '0 €';
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—');
  const asOfLabel = $derived(new Date(data.asOf).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }));

  const y = $derived(data.ytd);
  const barMax = $derived(Math.max(1, y.ca, y.prevCa));

  const catalogueStats = $derived([
    { label: 'Livres publiés', value: data.counts.books, href: '/admin/catalogue' },
    { label: 'À paraître', value: data.counts.forthcoming, href: '/admin/catalogue?status=forthcoming' },
    { label: 'Auteurs', value: data.counts.authors, href: '/admin/auteurs' },
    { label: 'Articles', value: data.counts.articles, href: '/admin/contenu' },
    { label: 'Rencontres à venir', value: data.counts.events, href: '/rencontres' }
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

<!-- Ventes année en cours vs N-1 à date -->
<section class="rounded-lg border border-border bg-card p-5">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="eyebrow">Ventes {y.year}</p>
      <p class="text-xs text-muted-foreground">au {asOfLabel}</p>
    </div>
    <a href="/admin/statistiques" class="text-sm text-link hover:underline">Statistiques détaillées →</a>
  </div>

  <div class="mt-3 flex flex-wrap items-end gap-x-8 gap-y-2">
    <div>
      <div class="text-4xl font-bold tabular-nums">{eur(y.ca)}</div>
      <div class="text-sm text-muted-foreground">{y.orders.toLocaleString('fr-FR')} commande{y.orders > 1 ? 's' : ''}</div>
    </div>
    {#if y.deltaPct !== null}
      <div class="rounded px-2 py-1 text-sm font-semibold {y.deltaPct >= 0 ? 'bg-success/15 text-success' : 'bg-destructive/10 text-destructive'}">
        {y.deltaPct >= 0 ? '▲' : '▼'} {Math.abs(y.deltaPct).toFixed(1)} % vs {y.prevYear}
      </div>
    {/if}
  </div>

  <div class="mt-4 max-w-xl space-y-2">
    <div class="flex items-center gap-3 text-sm">
      <span class="w-12 shrink-0 font-medium tabular-nums">{y.year}</span>
      <div class="h-5 flex-1 bg-secondary"><div class="h-5 bg-foreground" style="width:{(y.ca / barMax) * 100}%"></div></div>
      <span class="w-24 shrink-0 text-right tabular-nums">{eur(y.ca)}</span>
    </div>
    <div class="flex items-center gap-3 text-sm">
      <span class="w-12 shrink-0 font-medium tabular-nums text-muted-foreground">{y.prevYear}</span>
      <div class="h-5 flex-1 bg-secondary"><div class="h-5 bg-muted-foreground/40" style="width:{(y.prevCa / barMax) * 100}%"></div></div>
      <span class="w-24 shrink-0 text-right tabular-nums text-muted-foreground">{eur(y.prevCa)}</span>
    </div>
    <p class="text-xs text-muted-foreground">{y.prevYear} à la même date · {y.prevOrders.toLocaleString('fr-FR')} commandes{#if data.pending} · <a href="/admin/commandes?status=pending" class="text-link hover:underline">{data.pending} en attente</a>{/if}</p>
  </div>
</section>

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
            <td class="px-3 py-2 text-right tabular-nums">{eur(o.total)}</td>
            <td class="px-3 py-2 text-right text-muted-foreground">{dateFr(o.created_at)}</td>
          </tr>
        {/each}
        {#if data.recentOrders.length === 0}
          <tr><td colspan="5" class="px-3 py-10 text-center text-muted-foreground">Aucune commande.</td></tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>
