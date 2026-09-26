<script lang="ts">
  /**
   * Relevé d'un exercice : un seul geste (choisir une année, valider) qui va
   * chercher toutes les sources — ventes en librairie chez le distributeur,
   * ventes directes du site, mouvements de stock, et à la demande la part des
   * ventes hors France. La collecte tourne en tâche de fond ; la page suit son
   * avancement et affiche le récapitulatif de ce qui a été récupéré.
   */
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, Trash, Plus, ArrowsClockwise, CheckCircle, WarningCircle, CircleNotch, Circle, MinusCircle } from 'phosphor-svelte';

  let { data, form } = $props();
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const lbl = 'mb-1 block text-xs font-medium text-muted-foreground';
  const fmtP = (s: string, e: string) => `${new Date(s).toLocaleDateString('fr-FR')} → ${new Date(e).toLocaleDateString('fr-FR')}`;

  const anneeCourante = new Date().getUTCFullYear();
  const annees = [0, 1, 2, 3, 4].map((n) => anneeCourante - n);
  let annee = $state(anneeCourante);
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

{#if form?.error}<p class="mb-4 rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}

<!-- Le geste principal : une année, un bouton. -->
<div class="mb-6 rounded-lg border border-link/40 bg-link/5 p-5">
  <form method="POST" action="?/collecte" use:enhance={() => async ({ update }) => { await update({ reset: false }); await relire(); }}
    class="flex flex-wrap items-end gap-4">
    {#if periodeLibre}
      <label class={lbl}>Début <input name="period_start" type="date" required bind:value={debut} class="{input} w-44" /></label>
      <label class={lbl}>Fin <input name="period_end" type="date" required bind:value={fin} class="{input} w-44" /></label>
    {:else}
      <label class={lbl}>Exercice
        <select name="annee" bind:value={annee} class="{input} w-40">
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

<!-- Relevés enregistrés -->
<div class="overflow-x-auto rounded-lg border border-border bg-card">
  <table class="w-full text-sm">
    <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
      <tr><th class="px-3 py-2 font-medium">Période</th><th class="px-3 py-2 font-medium">Canal</th><th class="px-3 py-2 text-right font-medium">Lignes</th><th class="px-3 py-2"></th></tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each data.reports as r (r.id)}
        <tr class="hover:bg-muted/30">
          <td class="px-3 py-2">{fmtP(r.period_start, r.period_end)}{#if r.label && r.label !== 'auto'}<span class="ml-2 text-xs text-muted-foreground">{r.label}</span>{/if}</td>
          <td class="px-3 py-2">{r.channel_name}</td>
          <td class="px-3 py-2 text-right">{r.line_count}</td>
          <td class="px-3 py-2 text-right">
            <form method="POST" action="?/delete" use:enhance>
              <input type="hidden" name="reportId" value={String(r.id).replace('sales_report:', '')} />
              <button type="submit" class="text-muted-foreground hover:text-destructive" aria-label="Supprimer"
                onclick={(e: Event) => { if (!confirm('Supprimer ce relevé et ses lignes ?')) e.preventDefault(); }}><Trash size={15} /></button>
            </form>
          </td>
        </tr>
      {/each}
      {#if data.reports.length === 0}<tr><td colspan="4" class="px-3 py-8 text-center text-muted-foreground">Aucun relevé — lancez-en un ci-dessus.</td></tr>{/if}
    </tbody>
  </table>
</div>

<!-- Cas particulier : un relevé reçu sur papier ou par tableur. -->
<details class="mt-6 rounded-lg border border-border bg-card p-5">
  <summary class="cursor-pointer text-sm font-medium">Saisir un relevé à la main</summary>
  <form method="POST" action="?/create" use:enhance class="mt-4 grid gap-3 sm:grid-cols-2">
    <label class={lbl}>Canal
      <select name="channelId" class={input}>
        {#each data.channels as c (c.id)}<option value={String(c.id).replace('sales_channel:', '')}>{c.name}</option>{/each}
      </select>
    </label>
    <label class={lbl}>Libellé <input name="label" placeholder="ex. S1 2026" class={input} /></label>
    <label class={lbl}>Début <input name="period_start" type="date" required class={input} /></label>
    <label class={lbl}>Fin <input name="period_end" type="date" required class={input} /></label>
    <label class="{lbl} sm:col-span-2">Lignes de ventes (collage CSV)
      <textarea name="lines" rows="6" placeholder="ISBN;vendus;retours;format;prix&#10;9782748906264;2500;12;paper;20" class="{input} h-auto py-2 font-mono text-xs"></textarea>
    </label>
    <p class="text-xs text-muted-foreground sm:col-span-2">Une ligne par titre. Colonnes : ISBN, unités vendues, retours (opt.), format (paper/ebook, opt.), prix (opt.). Le livre est retrouvé par ISBN.</p>
    <div class="sm:col-span-2"><Button type="submit" variant="outline"><Plus size={15} /> Créer le relevé</Button></div>
  </form>
</details>
