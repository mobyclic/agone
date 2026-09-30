<script lang="ts">
  /**
   * Import d'un relevé depuis un tableur, en deux temps : on lit le fichier et
   * on propose une correspondance des colonnes ; l'opérateur corrige, précise
   * la période, valide. Le relevé rejoint les ventes de l'exercice.
   */
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, FileArrowUp, Spinner, CheckCircle } from 'phosphor-svelte';

  let { data, form } = $props();
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const lbl = 'mb-1 block text-xs font-medium text-muted-foreground';
  let lecture = $state(false);
  const l = $derived((form as any)?.lecture);
  // Correspondance choisie par colonne (initialisée à la proposition).
  let choix = $state<Record<number, string>>({});
  $effect(() => { if (l) choix = Object.fromEntries(l.entetes.map((_: string, i: number) => [i, l.proposition[i] ?? 'ignore'])); });
  const requisOk = $derived(Object.values(choix).includes('isbn') && Object.values(choix).includes('units_sold'));
  const annee = new Date().getUTCFullYear();
</script>

<svelte:head><title>Importer un relevé · {data.canal.name}</title></svelte:head>

<a href="/admin/canaux" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Canaux de vente</a>
<h2 class="text-xl font-bold">Importer un relevé — {data.canal.name}</h2>
<p class="mb-6 max-w-3xl text-sm text-muted-foreground">
  Déposez le tableur tel que vous le recevez. Les colonnes sont reconnues d’après leurs intitulés ; vous corrigez ce qui ne l’est pas,
  vous indiquez la période, et le relevé rejoint les ventes de l’exercice — pour les statistiques comme pour les droits d’auteur.
</p>

{#if form?.error}<p class="mb-4 rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}

<form method="POST" action="?/lire" enctype="multipart/form-data"
  use:enhance={() => { lecture = true; return async ({ update }) => { await update({ reset: false }); lecture = false; }; }}
  class="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-5">
  <input type="file" name="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required
    class="min-w-0 flex-1 text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted" />
  {#if l?.feuilles?.length > 1}
    <select name="feuille" class="h-10 rounded-md border border-border bg-background px-3 text-sm">
      {#each l.feuilles as f (f)}<option value={f} selected={f === l.feuille}>{f}</option>{/each}
    </select>
  {/if}
  <Button type="submit" disabled={lecture}>{#if lecture}<Spinner size={16} class="animate-spin" /> Lecture…{:else}<FileArrowUp size={16} /> Lire le fichier{/if}</Button>
</form>

{#if l}
  <form method="POST" action="?/importer" use:enhance class="space-y-5 rounded-lg border border-link/40 bg-link/5 p-5">
    <input type="hidden" name="token" value={l.token} />
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h3 class="text-base font-semibold">{l.nomFichier} <span class="text-sm font-normal text-muted-foreground">· feuille « {l.feuille} » · {l.nbLignes} lignes</span></h3>
    </div>

    <!-- Correspondance des colonnes : un choix par colonne, aperçu des cinq premières lignes en dessous. -->
    <div class="overflow-x-auto rounded-md border border-border bg-background">
      <table class="w-full text-xs">
        <thead>
          <tr class="border-b border-border bg-muted/40">
            {#each l.entetes as e, i (i)}
              <th class="min-w-[9rem] px-2 py-2 text-left align-top font-medium">
                <div class="mb-1 truncate text-muted-foreground" title={e}>{e}</div>
                <select name="col_{i}" bind:value={choix[i]} class="h-8 w-full rounded border border-border bg-background px-1.5 text-xs {choix[i] && choix[i] !== 'ignore' ? 'border-link font-medium' : 'text-muted-foreground'}">
                  {#each data.champs as c (c.key)}<option value={c.key}>{c.nom}{c.requis ? ' *' : ''}</option>{/each}
                </select>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          {#each l.apercu as ligne, r (r)}
            <tr>{#each l.entetes as _, i (i)}<td class="max-w-[14rem] truncate px-2 py-1.5 text-muted-foreground">{ligne[i] ?? ''}</td>{/each}</tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="text-xs text-muted-foreground">
      * obligatoires. {#each data.champs.filter((c) => c.aide && c.key !== 'ignore') as c (c.key)}<span class="mr-2"><strong>{c.nom}</strong> : {c.aide}</span>{/each}
    </p>

    <div class="grid gap-3 sm:grid-cols-4">
      <label class={lbl}>Période du <input name="period_start" type="date" required value="{annee}-01-01" class={input} /></label>
      <label class={lbl}>au <input name="period_end" type="date" required value="{annee}-12-31" class={input} /></label>
      <label class={lbl}>Format par défaut
        <select name="format" class={input}><option value="paper">Papier</option><option value="ebook">Numérique</option></select>
      </label>
      <label class={lbl}>Libellé <input name="label" placeholder={l.nomFichier} class={input} /></label>
    </div>

    <div class="flex items-center gap-3">
      <Button type="submit" disabled={!requisOk}><CheckCircle size={16} /> Importer ces {l.nbLignes} lignes</Button>
      {#if !requisOk}<span class="text-xs text-amber-700 dark:text-amber-500">Affectez au moins « ISBN / EAN » et « Exemplaires vendus ».</span>{/if}
    </div>
  </form>
{/if}
