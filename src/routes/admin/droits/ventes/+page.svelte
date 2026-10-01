<script lang="ts">
  /**
   * Relevé d'un exercice : un seul geste (choisir une année, valider) qui va
   * chercher toutes les sources — ventes en librairie chez le distributeur,
   * ventes directes du site, mouvements de stock, et à la demande la part des
   * ventes hors France. La collecte tourne en tâche de fond ; la page suit son
   * avancement et affiche le récapitulatif de ce qui a été récupéré.
   */
  import { enhance } from '$app/forms';
  import { invalidateAll, goto } from '$app/navigation';
  import { SvelteSet } from 'svelte/reactivity';
  import { Button } from '$lib/components/ui/button';
  import TableauVentesCanal from '$lib/components/TableauVentesCanal.svelte';
  import { ArrowLeft, ArrowsClockwise, CheckCircle, WarningCircle, CircleNotch, Circle, MinusCircle, DownloadSimple, CaretRight } from 'phosphor-svelte';

  let { data, form } = $props();
  const euros = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  /** Canaux dépliés : chacun charge son tableau à l'ouverture. */
  let deplies = $state(new SvelteSet<string>());
  const basculer = (code: string) => (deplies.has(code) ? deplies.delete(code) : deplies.add(code));
  const changerAnnee = (a: number) => goto(`?annee=${a}`, { keepFocus: true, noScroll: true });
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const lbl = 'mb-1 block text-xs font-medium text-muted-foreground';
  const fmtP = (s: string, e: string) => `${new Date(s).toLocaleDateString('fr-FR')} → ${new Date(e).toLocaleDateString('fr-FR')}`;

  const anneeCourante = new Date().getUTCFullYear();
  const annees = [0, 1, 2, 3, 4].map((n) => anneeCourante - n);
  const annee = $derived(data.annee);
  let avecExport = $state(false);
  /** Repli pour les cas particuliers : un semestre, un mois, un rattrapage. */
  let periodeLibre = $state(false);
  let debut = $state(`${anneeCourante}-01-01`);
  let fin = $state(`${anneeCourante}-12-31`);

  // ── Suivi de la collecte ─────────────────────────────────────────────────
  // L'état vient du serveur au chargement, puis du sondage tant que ça tourne.
  let sondage = $state<any>(null);
  const job = $derived(sondage ?? data.collecte);
  async function relire() {
    try { sondage = await (await fetch('/admin/droits/api/collecte')).json(); } catch { /* réseau : on retentera */ }
  }
  $effect(() => {
    if (!job?.enCours) return;
    const t = setInterval(relire, 2000);
    return () => clearInterval(t);
  });
  // Les relevés n'apparaissent dans la liste qu'une fois la collecte finie.
  let dernierFini = $state<string | null>(null);
  $effect(() => {
    if (job && !job.enCours && job.fin && job.fin !== dernierFini) {
      dernierFini = job.fin;
      void invalidateAll();
    }
  });

  const ICONE: Record<string, any> = { attente: Circle, en_cours: CircleNotch, fait: CheckCircle, erreur: WarningCircle, ignore: MinusCircle };
  const TEINTE: Record<string, string> = {
    attente: 'text-muted-foreground/60', en_cours: 'text-link animate-spin',
    fait: 'text-success', erreur: 'text-destructive', ignore: 'text-muted-foreground/40'
  };
</script>

<svelte:head><title>Ventes de l’exercice · Admin</title></svelte:head>

<a href="/admin/droits" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Droits d’auteur</a>
<h2 class="text-xl font-bold">Ventes de l’exercice</h2>
<p class="mb-6 text-sm text-muted-foreground">
  Choisissez une année et validez : le site va chercher lui-même les ventes en librairie, les ventes directes et les
  mouvements de stock. Les redevances s’appuient dessus.
</p>


<!-- Le geste principal : une année, un bouton. -->
<div class="mb-6 rounded-lg border border-border bg-card p-5">
  <form method="POST" action="?/collecte" use:enhance={() => async ({ update }) => { await update({ reset: false }); await relire(); }}
    class="flex flex-wrap items-end gap-4">
    {#if periodeLibre}
      <label class={lbl}>Début <input name="period_start" type="date" required bind:value={debut} class="{input} w-44" /></label>
      <label class={lbl}>Fin <input name="period_end" type="date" required bind:value={fin} class="{input} w-44" /></label>
    {:else}
      <label class={lbl}>Exercice
        <select name="annee" value={annee} onchange={(e: Event) => changerAnnee(Number((e.currentTarget as HTMLSelectElement).value))} class="{input} w-40">
          {#each annees as a (a)}<option value={a}>{a}</option>{/each}
        </select>
      </label>
    {/if}
    <label class="mb-2 flex items-center gap-2 text-sm">
      <input type="checkbox" name="avecExport" bind:checked={avecExport} class="size-4 accent-[var(--color-link)]" />
      Relever aussi les ventes hors France
    </label>
    <Button type="submit" disabled={job?.enCours} class="mb-0.5">
      <ArrowsClockwise size={15} /> {job?.enCours ? 'Relevé en cours…' : 'Relever'}
    </Button>
  </form>
  <p class="mt-3 text-xs text-muted-foreground">
    Comptez une à deux minutes ; la page suit l’avancement, vous pouvez la quitter et revenir.
    {#if avecExport}<strong>Les ventes hors France se lisent titre par titre : prévoyez plutôt dix minutes.</strong>{/if}
    Relancer une même période refait les relevés au lieu de les dupliquer.
    <button type="button" class="text-link hover:underline" onclick={() => (periodeLibre = !periodeLibre)}>
      {periodeLibre ? 'Revenir à une année entière' : 'Choisir une autre période (un mois, un semestre)'}
    </button>
  </p>
</div>

<!-- Récapitulatif de ce qui a été récupéré -->
{#if job}
  <div class="mb-6 rounded-lg border border-border bg-card p-5">
    <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h3 class="eyebrow">{job.enCours ? 'Relevé en cours' : 'Dernier relevé'}</h3>
      <span class="text-xs text-muted-foreground">
        {fmtP(job.periode.start, job.periode.end)} · lancé le {new Date(job.debut).toLocaleString('fr-FR')}
      </span>
    </div>
    <ul class="space-y-2.5">
      {#each job.etapes as e (e.key)}
        {@const Icone = ICONE[e.statut]}
        <li class="flex gap-2.5 text-sm">
          <Icone size={18} weight={e.statut === 'fait' ? 'fill' : 'regular'} class="mt-0.5 shrink-0 {TEINTE[e.statut]}" />
          <div class="min-w-0">
            <span class="font-medium {e.statut === 'ignore' ? 'text-muted-foreground' : ''}">{e.label}</span>
            {#if e.statut === 'ignore'}<span class="text-xs text-muted-foreground"> — non demandé</span>{/if}
            {#if e.detail}<p class="text-muted-foreground">{e.detail}</p>{/if}
            {#if e.remarque}<p class="text-xs text-muted-foreground/80">{e.remarque}</p>{/if}
            {#if e.error}<p class="text-xs text-destructive">{e.error}</p>{/if}
          </div>
        </li>
      {/each}
    </ul>
  </div>
{/if}

<!-- Les ventes de l'exercice, canal par canal : un tableau complet, à déplier. -->
<div class="mb-2 flex items-baseline justify-between gap-3">
  <h3 class="text-base font-semibold">Ventes {annee}, par canal</h3>
  <a href="/admin/droits/ventes/export.csv?annee={annee}" class="inline-flex items-center gap-1.5 text-xs text-link hover:underline">
    <DownloadSimple size={14} /> Export CSV des ventes {annee}
  </a>
</div>
<div class="mb-6 space-y-3">
  {#each data.resume as c (c.code)}
    {@const ouvert = deplies.has(c.code)}
    <div class="overflow-hidden rounded-lg border border-border bg-card {c.enabled ? '' : 'opacity-60'}">
      <button type="button" onclick={() => basculer(c.code)} aria-expanded={ouvert}
        class="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-muted/30 {ouvert ? 'border-b border-border' : ''}">
        <CaretRight size={13} weight="bold" class="shrink-0 text-muted-foreground transition-transform {ouvert ? 'rotate-90' : ''}" />
        <span class="inline-block size-3 rounded-sm" style="background:{c.color}"></span>
        <span class="font-medium">{c.name}</span>
        <span class="text-xs text-muted-foreground">{c.family === 'direct' ? 'vente directe' : 'vente indirecte'}{c.enabled ? '' : ' · désactivé'}</span>
        <span class="ml-auto text-sm tabular-nums text-muted-foreground">
          {#if c.lignes}
            {c.lignes.toLocaleString('fr-FR')} ligne{c.lignes > 1 ? 's' : ''} · <span class="text-foreground">{c.qty.toLocaleString('fr-FR')} ex.</span> · {euros(c.montant)} <span class="text-[10px] uppercase">{c.nature}</span>
          {:else}aucune vente relevée{/if}
        </span>
      </button>
      {#if ouvert}
        <TableauVentesCanal code={c.code} {annee} editable={c.editable} onchange={() => invalidateAll()} />
      {/if}
    </div>
  {/each}
</div>

