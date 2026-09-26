<script lang="ts">
  import { enhance } from '$app/forms';
  import TiersEditor from '$lib/components/TiersEditor.svelte';
  import { Button } from '$lib/components/ui/button';
  import { ROLE_LABEL } from '$lib/labels';
  import { ArrowLeft, FloppyDisk, Trash } from 'phosphor-svelte';
  import VentesExercices from '$lib/components/VentesExercices.svelte';

  let { data } = $props();
  const input = 'h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary';
  const lbl = 'mb-1 block text-xs font-medium text-muted-foreground';
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
          <th class="px-3 py-2 text-right font-medium">Entrées</th>
          <th class="px-3 py-2 text-right font-medium">Ventes brutes</th>
          <th class="px-3 py-2 text-right font-medium">Retours</th>
          <th class="px-3 py-2 text-right font-medium">SP &amp; gratuits</th>
          <th class="px-4 py-2 text-right font-medium">Stock fin</th>
        </tr>
      </thead>
      <tbody>
        {#each data.mouvements as m (m.period_start)}
          <tr class="border-t border-border">
            <td class="px-4 py-2">{new Date(m.period_start).toLocaleDateString('fr-FR')} → {new Date(m.period_end).toLocaleDateString('fr-FR')}</td>
            <td class="px-3 py-2 text-right tabular-nums">{m.stock_start}</td>
            <td class="px-3 py-2 text-right tabular-nums">{m.entries}</td>
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

<div class="space-y-5">
  {#each data.contributors as c (c.author_id + c.role)}
    {@const ct = c.contract}
    <div class="rounded-lg border border-border bg-card p-5">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <span class="font-semibold">{c.author_name}</span>
          <span class="ml-2 rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{ROLE_LABEL[c.role] ?? c.role}</span>
        </div>
        {#if ct}<span class="text-xs text-success">Contrat {ct.status}</span>{:else}<span class="text-xs text-muted-foreground">Pas de contrat</span>{/if}
      </div>

      <form method="POST" action="?/save" use:enhance class="space-y-4">
        <input type="hidden" name="authorId" value={c.author_id} />
        <input type="hidden" name="role" value={c.role} />

        <div>
          <span class={lbl}>Barème par paliers (droits progressifs)</span>
          <TiersEditor initial={ct?.tiers ?? []} />
        </div>

        <div class="grid gap-3 sm:grid-cols-4">
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
        </div>
        <label class={lbl}>Notes <input name="notes" value={ct?.notes ?? ''} class={input} /></label>

        <div class="flex items-center gap-2">
          <Button type="submit" size="sm"><FloppyDisk size={15} /> Enregistrer le contrat</Button>
        </div>
      </form>

      {#if ct}
        <form method="POST" action="?/delete" use:enhance class="mt-2">
          <input type="hidden" name="contractId" value={String(ct.id).replace('royalty_contract:', '')} />
          <button type="submit" class="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
            onclick={(e: Event) => { if (!confirm('Supprimer ce contrat ?')) e.preventDefault(); }}>
            <Trash size={13} /> Supprimer le contrat
          </button>
        </form>
      {/if}
    </div>
  {/each}
</div>
