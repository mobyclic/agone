<script lang="ts">
  import Icon from '$lib/components/Icon.svelte';
  import { FileText, Receipt, Coins } from 'phosphor-svelte';
  let { data } = $props();

  const sections = $derived([
    { href: '/admin/droits/contrats', title: 'Contrats', desc: 'Barèmes par paliers, à-valoir, périmètre — par livre et contributeur.', n: data.stats.contracts, icon: FileText },
    { href: '/admin/droits/ventes', title: 'Relevés de ventes', desc: 'Import des ventes par canal (site, Belles Lettres, …).', n: data.stats.reports, icon: Receipt },
    { href: '/admin/droits/reddition', title: 'Reddition de comptes', desc: 'États de droits par auteur et par période.', n: data.stats.statements, icon: Coins }
  ]);
  const fmtP = (s: string, e: string) =>
    `${new Date(s).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })} → ${new Date(e).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}`;
  const eur = (n: number) => `${(n ?? 0).toFixed(2).replace('.', ',')} €`;
</script>

<svelte:head><title>Droits d’auteur · Admin</title></svelte:head>

<div class="mb-6">
  <p class="eyebrow">Back-office</p>
  <h2 class="mt-1 text-xl font-bold">Droits d’auteur</h2>
  <p class="mt-1 text-sm text-muted-foreground">Contrats à paliers, ventes multi-canaux, reddition de comptes.</p>
</div>

<div class="grid gap-4 sm:grid-cols-3">
  {#each sections as s (s.href)}
    <a href={s.href} class="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary">
      <div class="flex items-center justify-between">
        <span class="grid size-10 place-items-center rounded-lg bg-accent text-primary"><s.icon size={20} /></span>
        <span class="text-2xl font-bold">{s.n}</span>
      </div>
      <h3 class="mt-3 font-semibold group-hover:text-primary">{s.title}</h3>
      <p class="mt-1 text-sm text-muted-foreground">{s.desc}</p>
    </a>
  {/each}
</div>

<div class="mt-8 grid gap-6 lg:grid-cols-2">
  <div class="rounded-lg border border-border bg-card p-5">
    <h3 class="eyebrow mb-3">Canaux de vente</h3>
    <ul class="space-y-1.5 text-sm">
      {#each data.channels as c (c.id)}<li class="flex justify-between"><span>{c.name}</span><span class="font-mono text-xs text-muted-foreground">{c.code}</span></li>{/each}
    </ul>
  </div>
  <div class="rounded-lg border border-border bg-card p-5">
    <h3 class="eyebrow mb-3">Redditions récentes</h3>
    {#if data.periods.length === 0}
      <p class="text-sm text-muted-foreground">Aucune reddition générée.</p>
    {:else}
      <ul class="space-y-1.5 text-sm">
        {#each data.periods as p (p.period_start)}
          <li class="flex justify-between"><span>{fmtP(p.period_start, p.period_end)}</span><span class="text-muted-foreground">{p.n} auteurs · {eur(p.total)}</span></li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
