<script lang="ts">
  /**
   * Import de commandes depuis un tableur : lecture du fichier, correspondance
   * des colonnes, réglages valables pour tout le fichier (type, paiement, date,
   * rencontre), aperçu des commandes, création.
   */
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, FileArrowUp, Spinner, CheckCircle, Eye, MagnifyingGlass, X } from 'phosphor-svelte';

  let { data, form } = $props();
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const lbl = 'mb-1 block text-xs font-medium text-muted-foreground';
  let lecture = $state(false);
  const l = $derived((form as any)?.lecture);
  const apercu = $derived((form as any)?.apercu);
  let choix = $state<Record<number, string>>({});
  $effect(() => { if (l) choix = Object.fromEntries(l.entetes.map((_: string, i: number) => [i, choix[i] ?? l.proposition[i] ?? 'ignore'])); });
  const requisOk = $derived(Object.values(choix).includes('isbn') || Object.values(choix).includes('title'));
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const dateFr = (d: string) => new Date(d).toLocaleDateString('fr-FR');
  const euro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

  // Rencontre commune à tout le fichier (facultative).
  let eq = $state('');
  let ehits = $state<{ id: string; title: string; start_at?: string; venue?: string }[]>([]);
  let evenement = $state<{ id: string; title: string; start_at?: string; venue?: string } | null>(null);
  let etimer: ReturnType<typeof setTimeout>;
  function esearch() {
    clearTimeout(etimer);
    const t = eq.trim();
    if (t.length < 2) { ehits = []; return; }
    etimer = setTimeout(async () => {
      const r = await fetch(`/admin/api/events?q=${encodeURIComponent(t)}`);
      ehits = r.ok ? (await r.json()).results : [];
    }, 200);
  }
</script>

<svelte:head><title>Importer des commandes · Admin</title></svelte:head>

<a href="/admin/commandes" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Commandes</a>
<h2 class="text-xl font-bold">Importer des commandes</h2>
<p class="mb-6 max-w-3xl text-sm text-muted-foreground">
  Un tableur de ventes (carnet de comptoir, salon, rencontre) : une ligne par livre vendu. Les colonnes sont reconnues d’après leurs
  intitulés, vous corrigez, vous fixez le type, le paiement et la date valables pour le fichier, vous relisez l’aperçu, et les commandes sont créées — antidatées, sans email au client.
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
  <form method="POST" use:enhance class="space-y-5 rounded-lg border border-border bg-card p-5">
    <input type="hidden" name="token" value={l.token} />
    <h3 class="text-base font-semibold">{l.nomFichier} <span class="text-sm font-normal text-muted-foreground">· feuille « {l.feuille} » · {l.nbLignes} lignes</span></h3>

    <!-- Correspondance des colonnes -->
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
      * ISBN ou Titre, l’un des deux. {#each data.champs.filter((c) => c.aide) as c (c.key)}<span class="mr-2"><strong>{c.nom}</strong> : {c.aide}</span>{/each}
    </p>

    <!-- Réglages valables pour tout le fichier -->
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label class={lbl}>Type de commande
        <select name="channel" class={input}>{#each data.types as t (t.value)}<option value={t.value}>{t.label}</option>{/each}</select>
      </label>
      <label class={lbl}>Mode de paiement (sauf colonne)
        <select name="payment_method" class={input}>
          <option value="sumup">Carte (SumUp)</option><option value="especes">Espèces</option><option value="cheque">Chèque</option><option value="virement">Virement</option><option value="autre">Autre</option>
        </select>
      </label>
      <label class={lbl}>Date (sauf colonne) <input name="placed_at" type="date" value={aujourdhui} class={input} /></label>
      <label class={lbl}>Statut
        <select name="status" class={input}><option value="paid">Payée</option><option value="completed">Terminée</option><option value="pending">En attente</option></select>
      </label>
    </div>
    <div>
      <span class={lbl}>Rencontre (facultative, pour tout le fichier)</span>
      <input type="hidden" name="eventId" value={evenement?.id ?? ''} />
      {#if evenement}
        <div class="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <span><span class="font-medium">{evenement.title}</span> <span class="text-muted-foreground">{evenement.start_at ? dateFr(evenement.start_at) : ''}{evenement.venue ? ` · ${evenement.venue}` : ''}</span></span>
          <button type="button" class="text-muted-foreground hover:text-foreground" onclick={() => (evenement = null)} aria-label="Retirer"><X size={16} /></button>
        </div>
      {:else}
        <div class="relative max-w-md">
          <MagnifyingGlass size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input bind:value={eq} oninput={esearch} placeholder="Rechercher une rencontre…" autocomplete="off" class="{input} pl-9" />
        </div>
        {#if ehits.length}
          <ul class="mt-1 max-w-md divide-y divide-border overflow-hidden rounded-md border border-border">
            {#each ehits as e (e.id)}
              <li><button type="button" class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/40" onclick={() => { evenement = e; eq = ''; ehits = []; }}>
                <span class="min-w-0 flex-1 truncate font-medium">{e.title}</span><span class="shrink-0 text-xs text-muted-foreground">{e.start_at ? dateFr(e.start_at) : ''}{e.venue ? ` · ${e.venue}` : ''}</span>
              </button></li>
            {/each}
          </ul>
        {/if}
      {/if}
    </div>

    <!-- Aperçu puis création -->
    {#if apercu}
      <div class="rounded-md border border-border bg-background">
        <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-2.5">
          <span class="text-sm font-semibold">{apercu.nb} commande{apercu.nb > 1 ? 's' : ''} · {euro(apercu.total)}</span>
          {#if apercu.ignorees}<span class="text-xs text-amber-700 dark:text-amber-500">{apercu.ignorees} ligne(s) sans livre reconnu seront ignorées</span>{/if}
        </div>
        <table class="w-full text-xs">
          <tbody class="divide-y divide-border">
            {#each apercu.commandes as c (c.cle)}
              <tr class="align-top">
                <td class="whitespace-nowrap px-4 py-2">{dateFr(c.date)}</td>
                <td class="px-3 py-2">
                  {#if c.nom || c.email}{c.nom || c.email}{#if c.nom && c.email}<span class="block text-muted-foreground">{c.email}</span>{/if}
                  {:else}<span class="text-muted-foreground">sans client</span>{/if}
                </td>
                <td class="px-3 py-2">{#each c.lignes as ligne, k (k)}<span class="block">{ligne}</span>{/each}{#each c.inconnus as x, k (k)}<span class="block text-amber-700 dark:text-amber-500">inconnu : {x}</span>{/each}</td>
                <td class="whitespace-nowrap px-4 py-2 text-muted-foreground">{c.payment}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if apercu.nb > 50}<p class="px-4 py-2 text-xs text-muted-foreground">… et {apercu.nb - 50} autres.</p>{/if}
      </div>
    {/if}
    <div class="flex flex-wrap items-center gap-3">
      <Button type="submit" formaction="?/apercu" variant="outline" disabled={!requisOk}><Eye size={16} /> Aperçu des commandes</Button>
      {#if apercu?.nb}
        <Button type="submit" formaction="?/importer"><CheckCircle size={16} /> Créer ces {apercu.nb} commande{apercu.nb > 1 ? 's' : ''}</Button>
      {/if}
      {#if !requisOk}<span class="text-xs text-amber-700 dark:text-amber-500">Affectez au moins une colonne ISBN ou Titre.</span>{/if}
    </div>
  </form>
{/if}
