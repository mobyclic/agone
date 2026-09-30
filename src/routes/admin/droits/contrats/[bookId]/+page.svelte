<script lang="ts">
  import { enhance } from '$app/forms';
  import { SvelteSet } from 'svelte/reactivity';
  import TiersEditor from '$lib/components/TiersEditor.svelte';
  import { Button } from '$lib/components/ui/button';
  import { ROLE_LABEL, CONTRAT_STATUT, CONTRAT_SCOPE, baremeCourt, validiteContrat } from '$lib/labels';
  import { ArrowLeft, FloppyDisk, Trash, ChartBar, X, CircleNotch, CaretRight, ArrowsOutSimple, ArrowsInSimple } from 'phosphor-svelte';
  import VentesExercices from '$lib/components/VentesExercices.svelte';

  let { data, form } = $props();
  const input = 'h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary';
  const lbl = 'mb-1 block text-xs font-medium text-muted-foreground';
  /** Date d'un champ <input type="date"> (vide si le contrat n'en porte pas). */
  const jour = (d?: string) => (d ? new Date(d).toISOString().slice(0, 10) : '');

  // Tout est replié par défaut : un contributeur, puis chacun de ses contrats,
  // s'ouvrent à la demande. Le formulaire d'avenant est un pli de plus.
  const cle = (c: any) => `${c.author_id}|${c.role}`;
  let contribsOuverts = $state(new SvelteSet<string>());
  let contratsOuverts = $state(new SvelteSet<string>());
  let avenants = $state(new SvelteSet<string>());
  const basculer = (set: SvelteSet<string>, k: string) => (set.has(k) ? set.delete(k) : set.add(k));
  const toutOuvert = $derived(data.contributors.every((c: any) => contribsOuverts.has(cle(c))));
  function toutBasculer() {
    if (toutOuvert) { contribsOuverts.clear(); contratsOuverts.clear(); return; }
    for (const c of data.contributors) {
      contribsOuverts.add(cle(c));
      for (const ct of c.contracts ?? []) contratsOuverts.add(String(ct.id));
    }
  }
  /** Ce qu'on lit d'un contrat sans l'ouvrir. */
  const resume = (ct: any) =>
    [baremeCourt(ct.tiers), CONTRAT_SCOPE[ct.scope] ?? ct.scope, validiteContrat(ct)].join(' · ');
  const couleurStatut = (s: string) => (s === 'active' ? 'text-success' : s === 'draft' ? 'text-warning' : 'text-muted-foreground');

  // Ventes et mouvements de stock : hors de la page, dans une fenêtre à la demande.
  let fenetre = $state(false);
  let chiffres = $state<any>(null);
  async function voirChiffres() {
    fenetre = true;
    if (chiffres) return;
    try { chiffres = await (await fetch(`/admin/droits/api/livre/${data.livreId}`)).json(); }
    catch { chiffres = { erreur: true }; }
  }
</script>

<svelte:head><title>Contrats · {data.book.title}</title></svelte:head>

<a href="/admin/droits/contrats" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Contrats</a>
<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">{data.book.title}</h2>
    <p class="text-sm text-muted-foreground">Un contrat par contributeur : barème par paliers de ventes, base de calcul et à-valoir.</p>
  </div>
  <div class="flex flex-wrap gap-2">
    {#if data.contributors.length}
      <Button type="button" variant="ghost" size="sm" onclick={toutBasculer}>
        {#if toutOuvert}<ArrowsInSimple size={15} /> Tout replier{:else}<ArrowsOutSimple size={15} /> Tout déplier{/if}
      </Button>
    {/if}
    <Button type="button" variant="outline" size="sm" onclick={voirChiffres}><ChartBar size={15} /> Ventes et mouvements de stock</Button>
  </div>
</div>


<!-- Provision sur retours : défaut de la maison, surchargeable pour ce titre. -->
<form method="POST" action="?/provision" use:enhance class="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
  <label class={lbl}>
    Provision sur retours de ce livre (%)
    <input name="returns_provision_rate" type="number" step="1" min="0" max="100" value={data.book.returns_provision_rate ?? ''}
      placeholder={String(data.reglages.provision_rate)} class="{input} mt-1 w-32" />
  </label>
  <Button type="submit" variant="outline" size="sm">Enregistrer</Button>
  <p class="text-xs text-muted-foreground">
    Vide = défaut de la maison ({data.reglages.provision_rate} %). Retenue sur les ventes de l'exercice, reprise à l'exercice suivant.
  </p>
</form>

<!-- Cessions de droits attachées à ce titre -->
{#if data.cessions.length}
  <div class="mb-6 overflow-hidden rounded-lg border border-border bg-card">
    <div class="flex items-baseline justify-between border-b border-border px-4 py-3">
      <h3 class="text-sm font-semibold">Cessions de droits</h3>
      <a href="/admin/droits/cessions" class="text-xs text-link hover:underline">Toutes les cessions</a>
    </div>
    <table class="w-full text-sm">
      <tbody class="divide-y divide-border">
        {#each data.cessions as c (c.id)}
          <tr class="hover:bg-muted/30">
            <td class="px-4 py-2">
              <a href="/admin/droits/cessions/{c.id}" class="font-medium hover:text-link">{c.counterparty}</a>
              <span class="block text-xs text-muted-foreground">
                {c.direction === 'out' ? 'droits vendus' : 'droits acquis'}{c.language ? ` · ${c.language}` : ''}
              </span>
            </td>
            <td class="px-3 py-2 text-right tabular-nums">{c.advance ? `${c.advance} ${c.currency === 'EUR' ? '€' : c.currency}` : '—'}<span class="block text-xs text-muted-foreground">à-valoir</span></td>
            <td class="px-3 py-2 text-right tabular-nums">{c.encaisse ? `${c.encaisse} €` : '—'}<span class="block text-xs text-muted-foreground">réglé</span></td>
            <td class="px-4 py-2 text-right text-xs text-muted-foreground">{c.direction === 'out' ? `${c.author_share} % aux auteurs` : ''}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

{#if data.contributors.length === 0}
  <p class="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Ce livre n’a pas encore de contributeur. Ajoutez-en depuis <a href="/admin/catalogue/{data.book.id ? String(data.book.id).replace('book:', '') : ''}" class="text-link hover:underline">la fiche catalogue</a>.</p>
{/if}

<div class="space-y-3">
  {#each data.contributors as c (c.author_id + c.role + (c.user_id ?? ''))}
    {@const liste = c.contracts ?? []}
    {@const k = cle(c)}
    {@const ouvert = contribsOuverts.has(k)}
    <div class="rounded-lg border border-border bg-card">
      <!-- En-tête du contributeur : tout ce qu'il faut savoir sans déplier. -->
      <button type="button" onclick={() => basculer(contribsOuverts, k)} aria-expanded={ouvert}
        class="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5 text-left hover:bg-muted/30 {ouvert ? 'rounded-t-lg border-b border-border' : 'rounded-lg'}">
        <CaretRight size={13} weight="bold" class="shrink-0 text-muted-foreground transition-transform {ouvert ? 'rotate-90' : ''}" />
        <span class="font-semibold">{c.author_name}</span>
        <span class="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{ROLE_LABEL[c.role] ?? c.role}</span>
        <span class="ml-auto text-xs {liste.length ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-500'}">
          {liste.length === 0
            ? c.role === 'director' ? 'proposé par défaut — contrat à établir' : 'aucun contrat'
            : liste.length === 1
              ? '1 contrat'
              : new Set(liste.map((x: any) => x.scope)).size === liste.length
                ? `${liste.length} contrats (une portée chacun)`
                : `${liste.length} contrats successifs`}
        </span>
        {#if !ouvert && liste.length}
          <span class="basis-full pl-6 text-xs text-muted-foreground">
            {#each liste as ct, i (ct.id)}{#if i}<span class="mx-1.5 opacity-40">|</span>{/if}<span class="tabular-nums">{resume(ct)}</span> <span class={couleurStatut(ct.status)}>{CONTRAT_STATUT[ct.status] ?? ct.status}</span>{/each}
          </span>
        {/if}
      </button>

      {#if ouvert}
        <div class="space-y-3 p-4">
          <!-- Chaque contrat est un pli : sa ligne de résumé, puis son formulaire. -->
          {#each liste as ct, i (ct.id)}
            {@const kc = String(ct.id)}
            {@const oc = contratsOuverts.has(kc)}
            <div class="rounded-md border border-border {oc ? '' : 'bg-muted/20'}">
              <button type="button" onclick={() => basculer(contratsOuverts, kc)} aria-expanded={oc}
                class="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2.5 text-left text-sm hover:bg-muted/40">
                <CaretRight size={12} weight="bold" class="shrink-0 text-muted-foreground transition-transform {oc ? 'rotate-90' : ''}" />
                <span class="font-medium">{liste.length > 1 ? `Contrat ${i + 1}` : 'Contrat'}</span>
                <span class="tabular-nums text-muted-foreground">{resume(ct)}</span>
                <span class="ml-auto text-xs {couleurStatut(ct.status)}">{CONTRAT_STATUT[ct.status] ?? ct.status}</span>
                {#if ct.document_name}<span class="basis-full pl-6 text-xs text-muted-foreground">Contrat déposé : {ct.document_name}</span>{/if}
              </button>
              {#if oc}
                <div class="border-t border-border p-4">{@render contrat(c, ct)}</div>
              {/if}
            </div>
          {/each}

          {#if liste.length === 0}
            {@render contrat(c, null)}
          {:else if avenants.has(k)}
            <div class="rounded-md border border-dashed border-border p-4">
              <p class="mb-3 text-xs text-muted-foreground">
                Nouvel avenant — les conditions du dernier contrat sont reprises, changez ce qui a été renégocié.
                Pensez à clore le contrat précédent à la veille de la prise d’effet.
              </p>
              {@render contrat(c, { ...liste[liste.length - 1], id: null, term_start: '', term_end: '', advance: 0, advance_recouped: 0 })}
            </div>
          {:else}
            <button type="button" class="text-sm text-link hover:underline" onclick={() => avenants.add(k)}>
              + Ajouter un avenant (nouvelles conditions à partir d’une date)
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</div>

<!-- Un contrat : ses conditions et sa période de validité. -->
{#snippet contrat(c: any, ct: any)}
  <form method="POST" action="?/save" use:enhance class="space-y-4">
    <input type="hidden" name="authorId" value={c.author_id} />
    <input type="hidden" name="role" value={c.role} />
    {#if ct?.id}<input type="hidden" name="contractId" value={String(ct.id).replace('royalty_contract:', '')} />{/if}

    <!-- Période de validité : c'est elle qui rattache chaque vente au bon contrat. -->
    <div class="grid gap-3 rounded-md bg-muted/40 p-3 sm:grid-cols-[repeat(2,minmax(0,12rem))_minmax(0,1fr)]">
      <label class={lbl}>En vigueur à partir du
        <input name="term_start" type="date" value={jour(ct?.term_start)} class="{input} mt-1" />
      </label>
      <label class={lbl}>Jusqu’au
        <input name="term_end" type="date" value={jour(ct?.term_end)} class="{input} mt-1" />
      </label>
      <p class="self-end text-xs text-muted-foreground">
        Vide = depuis l’origine / jusqu’à nouvel ordre. Les ventes de l’exercice sont ventilées entre les contrats
        successifs selon ces dates.
      </p>
    </div>

    <!-- Le directeur de collection est un coopérateur : on choisit son compte, sa fiche auteur suit. -->
    {#if c.role === 'director'}
      <label class={lbl}>Directeur de collection *
        <select name="director" required class="{input} mt-1 max-w-sm">
          {#each data.directeurs as u (u.id)}
            <option value={u.id} selected={c.user_id ? c.user_id === u.id : !!u.author_id && String(c.author_id).replace('author:', '') === u.author_id}>
              {u.full_name} · {u.role === 'admin' ? 'admin' : 'éditeur'}
            </option>
          {/each}
        </select>
      </label>
    {/if}

    <div>
      <span class={lbl}>Barème par paliers (droits progressifs)</span>
      <TiersEditor initial={ct?.tiers ?? []} />
    </div>

    <div class="grid gap-3 sm:grid-cols-5">
      <label class={lbl}>Périmètre
        <select name="scope" class={input}>
          <option value="all" selected={!ct || ct.scope === 'all'}>Tous supports</option>
          <option value="paper" selected={ct?.scope === 'paper'}>Papier</option>
          <option value="ebook" selected={ct?.scope === 'ebook'}>Numérique</option>
        </select>
      </label>
      <label class={lbl}>Base de calcul
        <select name="base" class={input}>
          <option value="ppht" selected={!ct || ct.base === 'ppht'}>Prix public HT</option>
          <option value="ppttc" selected={ct?.base === 'ppttc'}>Prix public TTC</option>
          <option value="net" selected={ct?.base === 'net'}>Net éditeur</option>
        </select>
      </label>
      <label class={lbl}>Net éditeur (%)
        <input name="net_rate" type="number" step="1" value={ct?.net_rate ?? 60} class={input} />
      </label>
      <label class={lbl} title="Part du barème revenant à ce contributeur : 50 pour un barème partagé entre deux coauteurs">
        Part du barème (%)
        <input name="share" type="number" step="1" min="0" max="100" value={ct?.share ?? 100} class={input} />
      </label>
      <label class={lbl}>Statut
        <select name="status" class={input}>
          <option value="active" selected={!ct || ct.status === 'active'}>Actif</option>
          <option value="draft" selected={ct?.status === 'draft'}>Brouillon</option>
          <option value="ended" selected={ct?.status === 'ended'}>Terminé</option>
        </select>
      </label>
    </div>

    <div class="grid gap-3 sm:grid-cols-3">
      <label class={lbl}>À-valoir (€) <input name="advance" type="number" step="0.01" value={ct?.advance ?? 0} class={input} /></label>
      <label class={lbl}>À-valoir déjà récupéré (€) <input name="advance_recouped" type="number" step="0.01" value={ct?.advance_recouped ?? 0} class={input} /></label>
      <label class={lbl} title="Contrats de traduction : « 2 % jusqu’à l’amortissement de l’à-valoir, 1 % après ». Le basculement se fait à l’euro près, même en cours d’exercice.">
        Taux après amortissement (%)
        <input name="rate_after_advance" type="number" step="0.5" min="0" placeholder="aucun" value={ct?.rate_after_advance ?? ''} class={input} />
      </label>
      <label class={lbl} title="Part sur les cessions de droits. Pour un auteur, elle se prend sur la part d’auteurs de la cession ; pour un traducteur, sur ce qui reste acquis à l’éditeur (10 % chez Agone).">
        Part sur les cessions (%)
        <input name="cession_share" type="number" step="1" min="0" max="100" placeholder={ct?.role === 'author' ? 'part du barème' : 'aucune'} value={ct?.cession_share ?? ''} class={input} />
      </label>
      <label class="mt-5 flex items-center gap-2 text-sm">
        <input type="checkbox" name="tiers_reset" checked={ct?.tiers_reset === true} class="size-4 accent-[var(--color-link)]" />
        Les paliers repartent de zéro
      </label>
    </div>
    <label class={lbl}>Notes <input name="notes" value={ct?.notes ?? ''} class={input} /></label>

    <div class="flex items-center gap-4">
      <Button type="submit" size="sm"><FloppyDisk size={15} /> {ct?.id ? 'Enregistrer' : 'Créer le contrat'}</Button>
      {#if ct?.id}
        <button type="submit" formaction="?/delete" class="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
          onclick={(e: Event) => { if (!confirm('Supprimer ce contrat ?')) e.preventDefault(); }}>
          <Trash size={13} /> Supprimer
        </button>
      {/if}
    </div>
  </form>
{/snippet}

<!-- Ventes par exercice et mouvements de stock, à la demande. -->
{#if fenetre}
  <div class="fixed inset-0 z-[70] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Ventes et mouvements de stock">
    <button type="button" class="absolute inset-0 cursor-default bg-black/60" aria-label="Fermer" onclick={() => (fenetre = false)}></button>
    <div class="relative z-10 max-h-[90svh] w-full max-w-4xl overflow-y-auto rounded-lg border border-border bg-background p-5 shadow-2xl">
      <button type="button" onclick={() => (fenetre = false)} class="absolute right-3 top-3 grid size-9 place-items-center text-muted-foreground hover:text-foreground" aria-label="Fermer"><X size={20} /></button>
      <h3 class="mb-4 pr-10 text-lg font-bold">{data.book.title}</h3>
      {#if !chiffres}
        <p class="flex items-center gap-2 text-sm text-muted-foreground"><CircleNotch size={16} class="animate-spin" /> Chargement…</p>
      {:else if chiffres.erreur}
        <p class="text-sm text-destructive">Chargement impossible.</p>
      {:else}
        <VentesExercices exercices={chiffres.ventes} />
        {#if chiffres.mouvements.length}
          <div class="mt-5 overflow-hidden rounded-lg border border-border bg-card">
            <div class="border-b border-border px-4 py-3"><h4 class="text-sm font-semibold">Mouvements de stock (Belles Lettres)</h4></div>
            <table class="w-full text-sm">
              <thead class="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th class="px-4 py-2 text-left font-medium">Période</th>
                  <th class="px-3 py-2 text-right font-medium">Stock début</th>
                  <th class="px-3 py-2 text-right font-medium">Entrées</th>
                  <th class="px-3 py-2 text-right font-medium">Sorties</th>
                  <th class="px-3 py-2 text-right font-medium">Ventes brutes</th>
                  <th class="px-3 py-2 text-right font-medium">Retours</th>
                  <th class="px-3 py-2 text-right font-medium">SP &amp; gratuits</th>
                  <th class="px-4 py-2 text-right font-medium">Stock fin</th>
                </tr>
              </thead>
              <tbody>
                {#each chiffres.mouvements as m (m.period_start + '|' + m.period_end)}
                  <tr class="border-t border-border">
                    <td class="px-4 py-2">{new Date(m.period_start).toLocaleDateString('fr-FR')} → {new Date(m.period_end).toLocaleDateString('fr-FR')}</td>
                    <td class="px-3 py-2 text-right tabular-nums">{m.stock_start}</td>
                    <td class="px-3 py-2 text-right tabular-nums">{m.entries}</td>
                    <td class="px-3 py-2 text-right tabular-nums">{m.exits}</td>
                    <td class="px-3 py-2 text-right tabular-nums font-medium">{m.gross_sales}</td>
                    <td class="px-3 py-2 text-right tabular-nums">{Math.abs(m.returns_credited)}</td>
                    <td class="px-3 py-2 text-right tabular-nums">{m.free_copies}</td>
                    <td class="px-4 py-2 text-right tabular-nums">{m.stock_end}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/if}
