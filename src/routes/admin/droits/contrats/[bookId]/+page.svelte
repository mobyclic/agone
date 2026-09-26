<script lang="ts">
  import { enhance } from '$app/forms';
  import { SvelteSet } from 'svelte/reactivity';
  import TiersEditor from '$lib/components/TiersEditor.svelte';
  import { Button } from '$lib/components/ui/button';
  import { ROLE_LABEL } from '$lib/labels';
  import { ArrowLeft, FloppyDisk, Trash } from 'phosphor-svelte';
  import VentesExercices from '$lib/components/VentesExercices.svelte';

  let { data } = $props();
  const input = 'h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary';
  const lbl = 'mb-1 block text-xs font-medium text-muted-foreground';
  /** Date d'un champ <input type="date"> (vide si le contrat n'en porte pas). */
  const jour = (d?: string) => (d ? new Date(d).toISOString().slice(0, 10) : '');

  // Formulaires d'avenant ouverts, par contributeur.
  const cle = (c: any) => `${c.author_id}|${c.role}`;
  let ouverts = $state(new SvelteSet<string>());
  const ouvrir = (k: string) => ouverts.add(k);
</script>

<svelte:head><title>Contrats · {data.book.title}</title></svelte:head>

<a href="/admin/droits/contrats" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Contrats</a>
<h2 class="text-xl font-bold">{data.book.title}</h2>
<p class="mb-4 text-sm text-muted-foreground">Un contrat par contributeur : barème par paliers de ventes, base de calcul et à-valoir.</p>

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

<div class="mb-6"><VentesExercices exercices={data.ventes} /></div>

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

<!-- Mouvements de stock relevés chez le distributeur : ce qui a été fabriqué,
     vendu, rendu et donné en service de presse sur chaque exercice importé. -->
{#if data.mouvements.length}
  <div class="mb-6 overflow-hidden rounded-lg border border-border bg-card">
    <div class="flex items-baseline justify-between border-b border-border px-4 py-3">
      <h3 class="text-sm font-semibold">Mouvements de stock (Belles Lettres)</h3>
      <span class="text-xs text-muted-foreground">Importés depuis <a href="/admin/droits/ventes" class="text-link hover:underline">Ventes &amp; rapports</a></span>
    </div>
    <table class="w-full text-sm">
      <thead class="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
        <tr>
          <th class="px-4 py-2 text-left font-medium">Exercice</th>
          <th class="px-3 py-2 text-right font-medium">Stock début</th>
          <th class="px-3 py-2 text-right font-medium" title="Fabrication et réassorts reçus par le distributeur">Entrées</th>
          <th class="px-3 py-2 text-right font-medium" title="Sorties de stock autres que les ventes : pilon, destructions, transferts">Sorties</th>
          <th class="px-3 py-2 text-right font-medium">Ventes brutes</th>
          <th class="px-3 py-2 text-right font-medium">Retours</th>
          <th class="px-3 py-2 text-right font-medium" title="Services de presse et exemplaires gratuits (« SceP &amp; Gratuits » chez Les Belles Lettres)">SP &amp; gratuits</th>
          <th class="px-4 py-2 text-right font-medium">Stock fin</th>
        </tr>
      </thead>
      <tbody>
        {#each data.mouvements as m (m.period_start)}
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

{#if data.contributors.length === 0}
  <p class="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Ce livre n’a pas encore de contributeur. Ajoutez-en depuis <a href="/admin/catalogue/{data.book.id ? String(data.book.id).replace('book:', '') : ''}" class="text-link hover:underline">la fiche catalogue</a>.</p>
{/if}

<div class="space-y-6">
  {#each data.contributors as c (c.author_id + c.role)}
    {@const liste = c.contracts ?? []}
    <div class="rounded-lg border border-border bg-card p-5">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <span class="font-semibold">{c.author_name}</span>
          <span class="ml-2 rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{ROLE_LABEL[c.role] ?? c.role}</span>
        </div>
        <span class="text-xs text-muted-foreground">
          {liste.length === 0 ? 'Pas de contrat' : liste.length === 1 ? '1 contrat' : `${liste.length} contrats successifs`}
        </span>
      </div>

      <div class="space-y-5">
        {#each liste as ct (ct.id)}
          {@render contrat(c, ct)}
        {/each}

        {#if liste.length === 0}
          {@render contrat(c, null)}
        {:else if ouverts.has(cle(c))}
          <div class="border-t border-dashed border-border pt-5">
            <p class="mb-3 text-xs text-muted-foreground">
              Nouvel avenant — les conditions du dernier contrat sont reprises, changez ce qui a été renégocié.
              Pensez à clore le contrat précédent à la veille de la prise d’effet.
            </p>
            {@render contrat(c, { ...liste[liste.length - 1], id: null, term_start: '', term_end: '', advance: 0, advance_recouped: 0 })}
          </div>
        {:else}
          <button type="button" class="text-sm text-link hover:underline" onclick={() => ouvrir(cle(c))}>
            + Ajouter un avenant (nouvelles conditions à partir d’une date)
          </button>
        {/if}
      </div>
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
