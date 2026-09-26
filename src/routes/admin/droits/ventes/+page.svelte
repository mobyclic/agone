<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, Trash, Plus, ArrowsClockwise } from 'phosphor-svelte';

  let { data, form } = $props();
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const lbl = 'mb-1 block text-xs font-medium text-muted-foreground';
  const fmtP = (s: string, e: string) => `${new Date(s).toLocaleDateString('fr-FR')} → ${new Date(e).toLocaleDateString('fr-FR')}`;

  // Mouvements de stock : périodes usuelles. Le relevé se fait mois par mois en
  // cours d'année et sur l'exercice entier au moment de l'arrêté des comptes.
  const jour = (d: Date) => d.toISOString().slice(0, 10);
  const maintenant = new Date();
  const moisEcoule = {
    debut: jour(new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() - 1, 1))),
    fin: jour(new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 0)))
  };
  const exercice = {
    debut: `${maintenant.getUTCFullYear()}-01-01`,
    fin: `${maintenant.getUTCFullYear()}-12-31`
  };
  let mvtDebut = $state(moisEcoule.debut);
  let mvtFin = $state(moisEcoule.fin);
</script>

<svelte:head><title>Relevés de ventes · Admin</title></svelte:head>

<a href="/admin/droits" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Droits d’auteur</a>
<h2 class="text-xl font-bold">Relevés de ventes</h2>
<p class="mb-6 text-sm text-muted-foreground">Importez les ventes par canal et par période. Les redevances s’appuient dessus.</p>

<div class="grid gap-6 lg:grid-cols-[1fr_360px]">
  <!-- Liste -->
  <div>
    <div class="overflow-x-auto rounded-lg border border-border bg-card">
      <table class="w-full text-sm">
        <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr><th class="px-3 py-2 font-medium">Période</th><th class="px-3 py-2 font-medium">Canal</th><th class="px-3 py-2 text-right font-medium">Lignes</th><th class="px-3 py-2"></th></tr>
        </thead>
        <tbody class="divide-y divide-border">
          {#each data.reports as r (r.id)}
            <tr class="hover:bg-muted/30">
              <td class="px-3 py-2">{fmtP(r.period_start, r.period_end)}{#if r.label}<span class="ml-2 text-xs text-muted-foreground">{r.label}</span>{/if}</td>
              <td class="px-3 py-2">{r.channel_name}</td>
              <td class="px-3 py-2 text-right">{r.line_count}</td>
              <td class="px-3 py-2 text-right">
                {#if r.channel_code === 'bldd'}
                  <!-- Une requête par titre : réservé aux relevés du distributeur. -->
                  <form method="POST" action="?/export" use:enhance class="mb-1 inline-block"
                    onsubmit={(e: Event) => { if (!confirm('Examiner le journal des ventes titre par titre ? Cela peut prendre plusieurs minutes.')) e.preventDefault(); }}>
                    <input type="hidden" name="reportId" value={String(r.id).replace('sales_report:', '')} />
                    <button type="submit" class="text-xs text-link hover:underline" title="Repérer les ventes hors France (taux réduit de moitié)">Part export</button>
                  </form>
                {/if}
                <form method="POST" action="?/delete" use:enhance>
                  <input type="hidden" name="reportId" value={String(r.id).replace('sales_report:', '')} />
                  <button type="submit" class="text-muted-foreground hover:text-destructive" aria-label="Supprimer"
                    onclick={(e: Event) => { if (!confirm('Supprimer ce relevé et ses lignes ?')) e.preventDefault(); }}><Trash size={15} /></button>
                </form>
              </td>
            </tr>
          {/each}
          {#if data.reports.length === 0}<tr><td colspan="4" class="px-3 py-8 text-center text-muted-foreground">Aucun relevé.</td></tr>{/if}
        </tbody>
      </table>
    </div>
  </div>

  <div class="space-y-6">
  <!-- Ventes directes : reprises des commandes, sans ressaisie -->
  <div class="rounded-lg border border-link/40 bg-link/5 p-5">
    <h3 class="eyebrow mb-1">Depuis les commandes</h3>
    <p class="mb-3 text-xs text-muted-foreground">
      Reconstruit les relevés des canaux directs à partir des commandes payées de la période, au prix réellement
      encaissé ; les commandes remboursées comptent en retours. <strong>Le papier du site et de la VPC est exclu</strong> :
      ces commandes sont expédiées et facturées par Les Belles Lettres, donc déjà comptées dans leur relevé. Seul le
      numérique en est repris. Relançable : les relevés automatiques de la même période sont refaits.
    </p>
    <form method="POST" action="?/depuisCommandes" use:enhance class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <label class={lbl}>Début <input name="period_start" type="date" required class={input} /></label>
        <label class={lbl}>Fin <input name="period_end" type="date" required class={input} /></label>
      </div>
      <Button type="submit" variant="outline" class="w-full"><ArrowsClockwise size={15} /> Générer les relevés</Button>
    </form>
  </div>

  <!-- Distributeur : état des ventes et retours de l'extranet BLDD -->
  <div class="rounded-lg border border-border bg-card p-5">
    <h3 class="eyebrow mb-1">Depuis Les Belles Lettres</h3>
    <p class="mb-3 text-xs text-muted-foreground">
      Récupère l'« État des ventes et retours » de l'extranet BLDD : par ISBN, exemplaires vendus et retournés,
      chiffre au prix public HT et montant facturé. C'est le gros du volume — les ventes en librairie.
    </p>
    <form method="POST" action="?/depuisBldd" use:enhance class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <label class={lbl}>Début <input name="period_start" type="date" required class={input} /></label>
        <label class={lbl}>Fin <input name="period_end" type="date" required class={input} /></label>
      </div>
      <Button type="submit" variant="outline" class="w-full"><ArrowsClockwise size={15} /> Importer depuis BLDD</Button>
    </form>
  </div>

  <!-- Mouvements de stock : ce que l'article 6 des contrats impose de mentionner -->
  <div class="rounded-lg border border-border bg-card p-5">
    <h3 class="eyebrow mb-1">Mouvements de stock (BLDD)</h3>
    <p class="mb-3 text-xs text-muted-foreground">
      Stock d'ouverture et de clôture, exemplaires fabriqués, sorties et services de presse, mois par mois puis
      consolidés. Ce sont les mentions qu'impose l'article 6 des contrats d'auteur. Une requête par mois demandé,
      quel que soit le nombre de titres : un mois pour le suivi courant, l'exercice entier pour l'arrêté des comptes.
    </p>
    <form method="POST" action="?/mouvements" use:enhance class="space-y-3">
      <div class="flex gap-2">
        <button type="button" class="rounded border border-border px-2.5 py-1 text-xs hover:bg-muted"
          onclick={() => { mvtDebut = moisEcoule.debut; mvtFin = moisEcoule.fin; }}>Mois écoulé</button>
        <button type="button" class="rounded border border-border px-2.5 py-1 text-xs hover:bg-muted"
          onclick={() => { mvtDebut = exercice.debut; mvtFin = exercice.fin; }}>Exercice {maintenant.getUTCFullYear()}</button>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <label class={lbl}>Début <input name="period_start" type="date" required bind:value={mvtDebut} class={input} /></label>
        <label class={lbl}>Fin <input name="period_end" type="date" required bind:value={mvtFin} class={input} /></label>
      </div>
      <Button type="submit" variant="outline" class="w-full"><ArrowsClockwise size={15} /> Relever les mouvements</Button>
    </form>
  </div>

  <!-- Nouveau relevé -->
  <div class="rounded-lg border border-border bg-card p-5">
    <h3 class="eyebrow mb-3">Nouveau relevé</h3>
    {#if form?.error}<p class="mb-3 rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}
    <form method="POST" action="?/create" use:enhance class="space-y-3">
      <label class={lbl}>Canal
        <select name="channelId" class={input}>
          {#each data.channels as c (c.id)}<option value={String(c.id).replace('sales_channel:', '')}>{c.name}</option>{/each}
        </select>
      </label>
      <div class="grid grid-cols-2 gap-3">
        <label class={lbl}>Début <input name="period_start" type="date" required class={input} /></label>
        <label class={lbl}>Fin <input name="period_end" type="date" required class={input} /></label>
      </div>
      <label class={lbl}>Libellé <input name="label" placeholder="ex. S1 2026" class={input} /></label>
      <label class={lbl}>Lignes de ventes (collage CSV)
        <textarea name="lines" rows="7" placeholder="ISBN;vendus;retours;format;prix&#10;9782748906264;2500;12;paper;20" class="{input} h-auto py-2 font-mono text-xs"></textarea>
      </label>
      <p class="text-xs text-muted-foreground">Une ligne par titre. Colonnes : ISBN, unités vendues, retours (opt.), format (paper/ebook, opt.), prix (opt.). Le livre est retrouvé par ISBN.</p>
      <Button type="submit" class="w-full"><Plus size={15} /> Créer le relevé</Button>
    </form>
  </div>
  </div>
</div>
