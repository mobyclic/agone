<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { FileText, Receipt, Coins, FloppyDisk, ArrowsClockwise, Globe } from 'phosphor-svelte';
  let { data } = $props();

  const exercice = new Date().getUTCFullYear();

  const sections = $derived([
    { href: '/admin/droits/contrats', title: 'Contrats', desc: 'Barèmes par paliers, à-valoir, périmètre — par livre et contributeur.', n: data.stats.contracts, icon: FileText },
    { href: '/admin/droits/ventes', title: 'Ventes de l’exercice', desc: 'Ventes en librairie, ventes du site et mouvements de stock, année par année.', n: data.stats.reports, icon: Receipt },
    { href: '/admin/droits/reddition', title: 'Reddition de comptes', desc: 'États de droits par auteur et par période.', n: data.stats.statements, icon: Coins },
    { href: '/admin/droits/cessions', title: 'Cessions de droits', desc: 'Droits vendus à l’étranger et droits acquis : à-valoir, taux, échéances.', n: data.stats.cessions, icon: Globe }
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

<!-- Le parcours, dans l'ordre : relever les ventes, vérifier les contrats, arrêter les comptes. -->
<div class="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-link/40 bg-link/5 p-5">
  <div class="max-w-2xl">
    <h3 class="eyebrow mb-1">Arrêté des comptes</h3>
    <p class="text-sm text-muted-foreground">
      Trois temps : <strong>relever les ventes</strong> de l’année, vérifier les contrats des titres concernés, puis
      générer la reddition. Le relevé va chercher lui-même les ventes en librairie chez Les Belles Lettres, les ventes
      du site et les mouvements de stock — rien à saisir.
    </p>
  </div>
  <form method="POST" action="/admin/droits/ventes?/collecte">
    <input type="hidden" name="annee" value={exercice} />
    <Button type="submit"><ArrowsClockwise size={15} /> Relever l’exercice {exercice}</Button>
  </form>
</div>

<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
  {#each sections as s (s.href)}
    <a href={s.href} class="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary">
      <div class="flex items-center justify-between">
        <span class="grid size-10 place-items-center rounded-lg bg-accent text-link"><s.icon size={20} /></span>
        <span class="text-2xl font-bold">{s.n}</span>
      </div>
      <h3 class="mt-3 font-semibold group-hover:text-link">{s.title}</h3>
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
    <h3 class="eyebrow mb-1">Règles de calcul</h3>
    <p class="mb-3 text-xs text-muted-foreground">
      Valeurs par défaut de la maison. La provision se règle livre par livre depuis la page des contrats.
    </p>
    <form method="POST" action="?/reglages" use:enhance class="flex flex-wrap items-end gap-3">
      <label class="text-xs font-medium text-muted-foreground">
        Provision sur retours (%)
        <input name="provision_rate" type="number" step="1" min="0" max="100" value={data.reglages.provision_rate}
          class="mt-1 h-10 w-28 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary" />
      </label>
      <label class="text-xs font-medium text-muted-foreground">
        Seuil de paiement (€)
        <input name="threshold" type="number" step="1" min="0" value={data.reglages.threshold}
          class="mt-1 h-10 w-28 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary" />
      </label>
      <Button type="submit" variant="outline"><FloppyDisk size={15} /> Enregistrer</Button>
    </form>
    <p class="mt-2 text-xs text-muted-foreground">
      Sous le seuil, le net n'est pas versé : il est reporté sur l'exercice suivant (contrats Agone : 100 €).
    </p>
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
