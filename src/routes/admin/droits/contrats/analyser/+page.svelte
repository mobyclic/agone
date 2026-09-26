<script lang="ts">
  /**
   * Dépôt d'un contrat signé et lecture automatique de ses clauses.
   *
   * Ce que la machine lit est une PROPOSITION : l'opérateur corrige puis valide.
   * Les contrats créés le sont en BROUILLON, pour qu'un barème mal lu ne se
   * retrouve pas dans une reddition sans avoir été relu.
   */
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, FileArrowUp, Spinner, Warning, CheckCircle, MagnifyingGlass } from 'phosphor-svelte';

  let { form } = $props();
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const lbl = 'mb-1 block text-xs font-medium text-muted-foreground';

  let lecture = $state(false);
  const a = $derived((form as any)?.analyse);
  const GENRE: Record<string, string> = {
    edition: 'Contrat d’édition', traduction: 'Contrat de traduction',
    cession: 'Cession de droits', inconnu: 'Type non reconnu'
  };

  // Livre retenu : la meilleure proposition, sinon une recherche libre.
  let livre = $state<{ id: string; title: string } | null>(null);
  let recherche = $state('');
  let trouves = $state<any[]>([]);
  let minuteur: ReturnType<typeof setTimeout>;
  $effect(() => { if (a?.livres?.length && !livre) livre = a.livres[0]; });
  function chercher() {
    clearTimeout(minuteur);
    const q = recherche.trim();
    if (q.length < 2) { trouves = []; return; }
    minuteur = setTimeout(async () => {
      try { trouves = await (await fetch(`/api/books/search?q=${encodeURIComponent(q)}`)).json(); }
      catch { trouves = []; }
    }, 200);
  }

  const bareme = (t: any[]) => (t ?? []).map((p) => `${p.rate} %${p.up_to ? ` jusqu’à ${p.up_to.toLocaleString('fr-FR')} ex.` : ' au-delà'}`).join(' · ');
</script>

<svelte:head><title>Lire un contrat · Admin</title></svelte:head>

<a href="/admin/droits/contrats" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Contrats</a>
<h2 class="text-xl font-bold">Lire un contrat</h2>
<p class="mb-6 max-w-3xl text-sm text-muted-foreground">
  Déposez le contrat signé : ses clauses sont lues et proposées. Rien n’est enregistré sans votre accord, et les
  contrats créés le sont en <strong>brouillon</strong> — un barème mal lu ne doit pas se retrouver dans une reddition.
  Le fichier est rangé dans le stockage privé et rattaché au contrat.
</p>

{#if (form as any)?.error}
  <p class="mb-4 rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{(form as any).error}</p>
{/if}

<form method="POST" action="?/analyser" enctype="multipart/form-data"
  use:enhance={() => { lecture = true; return async ({ update }) => { await update({ reset: false }); lecture = false; }; }}
  class="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-5">
  <input type="file" name="file" accept=".pdf,application/pdf" required
    class="min-w-0 flex-1 text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted" />
  <Button type="submit" disabled={lecture}>
    {#if lecture}<Spinner size={16} class="animate-spin" /> Lecture…{:else}<FileArrowUp size={16} /> Lire le contrat{/if}
  </Button>
</form>

{#if a}
  {#if !a.lisible}
    <div class="rounded-lg border border-warning/40 bg-warning/10 p-5">
      <p class="flex items-start gap-2 text-sm"><Warning size={18} weight="fill" class="mt-0.5 shrink-0 text-warning" />
        {a.reserves[0]}</p>
      <p class="mt-2 text-sm text-muted-foreground">
        Le fichier est conservé. Saisissez les conditions depuis <a href="/admin/droits/contrats" class="text-link hover:underline">la fiche du livre</a>.
      </p>
    </div>
  {:else}
    <form method="POST" action="?/creer" use:enhance class="space-y-5 rounded-lg border border-border bg-card p-5">
      <input type="hidden" name="mediaId" value={(form as any).mediaId} />
      <input type="hidden" name="nomFichier" value={(form as any).nomFichier} />
      <input type="hidden" name="genre" value={a.genre} />
      <input type="hidden" name="tiers" value={JSON.stringify(a.paliers ?? [])} />
      <input type="hidden" name="taux_numerique" value={a.taux_numerique ?? ''} />
      <input type="hidden" name="avaloir" value={a.avaloir ?? ''} />
      <input type="hidden" name="sens" value={a.sens ?? 'out'} />
      <input type="hidden" name="contrepartie" value={a.contrepartie ?? ''} />
      <input type="hidden" name="langue" value={a.langue ?? ''} />
      <input type="hidden" name="duree_ans" value={a.duree_ans ?? ''} />

      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-base font-semibold">{GENRE[a.genre] ?? a.genre}</h3>
        <span class="text-xs text-muted-foreground">{(form as any).nomFichier}</span>
      </div>

      <!-- Ce qui a été lu -->
      <dl class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div><dt class="text-xs uppercase text-muted-foreground">Titre au contrat</dt><dd>{a.titre ?? '—'}</dd></div>
        {#if a.genre === 'cession'}
          <div><dt class="text-xs uppercase text-muted-foreground">Contrepartie</dt><dd>{a.contrepartie ?? '—'} {a.langue ? `· ${a.langue}` : ''}</dd></div>
          <div><dt class="text-xs uppercase text-muted-foreground">Sens</dt><dd>{a.sens === 'in' ? 'Droits acquis (Agone paie)' : 'Droits vendus (Agone encaisse)'}</dd></div>
          <div><dt class="text-xs uppercase text-muted-foreground">Durée</dt><dd>{a.duree_ans ? `${a.duree_ans} ans` : '—'}</dd></div>
        {:else}
          <div><dt class="text-xs uppercase text-muted-foreground">Contributeurs</dt><dd>{a.personnes.map((p: any) => p.nom).join(', ') || '—'}</dd></div>
          <div><dt class="text-xs uppercase text-muted-foreground">Exemplaires d’auteur</dt><dd>{a.exemplaires_auteur ?? '—'}</dd></div>
          <div><dt class="text-xs uppercase text-muted-foreground">Seuil de paiement</dt><dd>{a.seuil ? `${a.seuil} €` : '—'}</dd></div>
        {/if}
        <div><dt class="text-xs uppercase text-muted-foreground">Barème</dt><dd>{bareme(a.paliers) || '—'}</dd></div>
        <div><dt class="text-xs uppercase text-muted-foreground">Numérique</dt><dd>{a.taux_numerique ? `${a.taux_numerique} %` : '—'}</dd></div>
        <div><dt class="text-xs uppercase text-muted-foreground">À-valoir</dt><dd>{a.avaloir ? `${a.avaloir.toLocaleString('fr-FR')} €` : '—'}</dd></div>
      </dl>

      {#if a.reserves.length}
        <ul class="list-disc space-y-1 rounded-md bg-warning/10 p-3 pl-7 text-sm text-muted-foreground">
          {#each a.reserves as r (r)}<li>{r}</li>{/each}
        </ul>
      {/if}

      <!-- Livre concerné -->
      <div>
        <span class={lbl}>Livre concerné</span>
        {#if livre}
          <div class="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
            <span class="inline-flex items-center gap-1.5 truncate font-medium"><CheckCircle size={15} weight="fill" class="text-success" /> {livre.title}</span>
            <button type="button" class="text-xs text-link hover:underline" onclick={() => { livre = null; recherche = ''; }}>changer</button>
          </div>
          <input type="hidden" name="bookId" value={livre.id} />
          {#if a.livres.length > 1}
            <p class="mt-1 text-xs text-muted-foreground">
              Autres propositions :
              {#each a.livres.slice(1) as l (l.id)}
                <button type="button" class="ml-1 text-link hover:underline" onclick={() => (livre = l)}>{l.title}</button>
              {/each}
            </p>
          {/if}
        {:else}
          <div class="relative">
            <MagnifyingGlass size={15} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input bind:value={recherche} oninput={chercher} placeholder="Chercher un titre…" class="{input} pl-9" />
          </div>
          {#if trouves.length}
            <ul class="mt-1 max-h-48 overflow-y-auto rounded-md border border-border">
              {#each trouves as b (b.id)}
                <li><button type="button" class="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
                  onclick={() => { livre = { id: String(b.id).replace('book:', ''), title: b.title }; trouves = []; }}>{b.title}</button></li>
              {/each}
            </ul>
          {/if}
        {/if}
      </div>

      {#if a.genre !== 'cession'}
        <!-- Contributeurs retrouvés au catalogue -->
        <div>
          <span class={lbl}>Contrats à créer</span>
          {#if a.auteurs.length}
            <ul class="space-y-1.5">
              {#each a.auteurs as au (au.id)}
                <li class="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="auteurId" value={au.id} checked class="size-4 accent-[var(--color-link)]" />
                  {au.full_name}
                  <span class="text-xs text-muted-foreground">{au.role === 'translator' ? 'traducteur' : 'auteur'}</span>
                </li>
              {/each}
            </ul>
            <input type="hidden" name="role" value={a.auteurs[0].role} />
            {#if a.auteurs.length > 1}
              <label class="mt-2 block text-xs text-muted-foreground">
                Part du barème pour chacun (%)
                <input name="share" type="number" min="0" max="100" value={Math.round(100 / a.auteurs.length)} class="{input} mt-1 w-28" />
              </label>
            {/if}
          {:else}
            <p class="text-sm text-muted-foreground">
              Aucun contributeur retrouvé au catalogue : créez les contrats depuis la fiche du livre.
            </p>
          {/if}
        </div>
      {/if}

      <div class="flex items-center gap-3 border-t border-border pt-4">
        <Button type="submit" disabled={!livre}>
          {a.genre === 'cession' ? 'Créer la cession' : 'Créer les contrats (brouillon)'}
        </Button>
        <span class="text-xs text-muted-foreground">Vous pourrez corriger le barème avant de les passer en actif.</span>
      </div>
    </form>
  {/if}
{/if}
