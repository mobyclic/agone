<script lang="ts">
  /**
   * Rapprochement des encaissements SumUp : ce que le terminal a encaissé, et
   * quel(s) livre(s) c'était. L'automate propose (rencontre du jour, catalogue,
   * prix) ; ici on tranche ce qu'il n'a pas pu décider, et on relit le reste.
   */
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import EntityPicker from '$lib/components/EntityPicker.svelte';
  import { ArrowLeft, ArrowsClockwise, Check, X, ArrowCounterClockwise, CalendarDots } from 'phosphor-svelte';

  let { data, form } = $props();
  const input = 'h-9 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary';

  const ETATS: { id: string; nom: string }[] = [
    { id: 'a_traiter', nom: 'À traiter' }, { id: 'auto', nom: 'Rapprochés d’office' }, { id: 'valide', nom: 'Validés' }, { id: 'ignore', nom: 'Ignorés' }
  ];
  const jour = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  const heure = (d: string) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const euros = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const depuisDefaut = iso(new Date(Date.now() - 60 * 24 * 3600 * 1000));
  const jusquaDefaut = iso(new Date());

  /** Encaissement en cours de saisie libre (livres choisis à la main). */
  let libre = $state<string | null>(null);
</script>

<svelte:head><title>Encaissements SumUp · Admin</title></svelte:head>

<a href="/admin/canaux" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Canaux de vente</a>
<div class="mb-5 flex flex-wrap items-end justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">Encaissements SumUp</h2>
    <p class="text-sm text-muted-foreground">
      Le terminal ne connaît pas le catalogue : chaque encaissement est rapproché d’un livre — d’office quand la rencontre du jour
      et le montant ne laissent qu’une lecture, à la main sinon. Déclarer les livres vendus sur une rencontre (sa fiche, « Livres associés ») rend l’automate plus sûr.
    </p>
  </div>
  {#if data.config.configure}
    <form method="POST" action="?/relever" use:enhance class="flex flex-wrap items-end gap-2">
      <label class="text-xs text-muted-foreground">Du <input name="depuis" type="date" value={depuisDefaut} class="{input} ml-1" /></label>
      <label class="text-xs text-muted-foreground">au <input name="jusqua" type="date" value={jusquaDefaut} class="{input} ml-1" /></label>
      <Button type="submit" size="sm"><ArrowsClockwise size={15} /> Relever</Button>
    </form>
  {/if}
</div>

{#if !data.config.configure}
  <p class="mb-4 rounded bg-warning/15 px-3 py-2 text-sm text-warning">
    Clé API absente : renseignez <code>SUMUP_API_KEY</code> dans les variables d’environnement pour relever les encaissements.
  </p>
{:else if data.config.dernier_releve}
  <p class="mb-4 text-xs text-muted-foreground">Dernier relevé le {jour(data.config.dernier_releve)} à {heure(data.config.dernier_releve)}{data.config.merchant_code ? ` · marchand ${data.config.merchant_code}` : ''}.</p>
{/if}
{#if form?.error}<p class="mb-4 rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}

<div class="mb-4 flex flex-wrap items-center gap-2">
  {#each ETATS as e (e.id)}
    <a href="?etat={e.id}" class="rounded-full border px-3 py-1 text-xs {data.etat === e.id ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground'}">
      {e.nom} <span class="ml-1 tabular-nums opacity-70">{data.comptes[e.id] ?? 0}</span>
    </a>
  {/each}
  {#if data.etat === 'a_traiter' && (data.comptes.a_traiter ?? 0) > 0}
    <form method="POST" action="?/relancer" use:enhance class="ml-auto">
      <Button type="submit" variant="outline" size="sm" title="Utile après avoir complété les livres d’une rencontre"><ArrowsClockwise size={14} /> Relancer l’automate</Button>
    </form>
  {/if}
</div>

<div class="overflow-hidden rounded-lg border border-border bg-card">
  <table class="w-full text-sm">
    <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
      <tr>
        <th class="px-4 py-2 font-medium">Encaissement</th>
        <th class="px-3 py-2 text-right font-medium">Montant</th>
        <th class="px-3 py-2 font-medium">Rencontre du jour</th>
        <th class="px-3 py-2 font-medium">Livres</th>
        <th class="px-4 py-2 text-right font-medium"></th>
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each data.encaissements as t (t.id)}
        <tr class="align-top {t.status === 'REFUNDED' ? 'opacity-70' : ''}">
          <td class="px-4 py-2.5 whitespace-nowrap">
            <span class="font-medium">{jour(t.at)}</span> <span class="text-muted-foreground">{heure(t.at)}</span>
            {#if t.status === 'REFUNDED'}<span class="ml-1 rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">remboursé</span>{/if}
            {#if t.summary}<span class="block text-xs text-muted-foreground">{t.summary}</span>{/if}
            {#if t.note}<span class="block text-xs italic text-muted-foreground">{t.note}</span>{/if}
          </td>
          <td class="px-3 py-2.5 text-right tabular-nums font-medium">{euros(t.amount)}</td>
          <td class="px-3 py-2.5 text-xs">
            {#if t.event_title}
              <a href="/admin/rencontres/{t.event_slug ?? ''}" class="inline-flex items-center gap-1 text-link hover:underline"><CalendarDots size={13} /> {t.event_title}</a>
            {:else}<span class="text-muted-foreground">aucune</span>{/if}
          </td>
          <td class="px-3 py-2.5">
            {#if t.items?.length}
              <ul class="text-xs">
                {#each t.items as i, k (k)}<li>{i.title ?? String(i.book)}{i.qty > 1 ? ` × ${i.qty}` : ''} <span class="text-muted-foreground">({euros(i.price)})</span></li>{/each}
              </ul>
            {:else if t.etat === 'a_traiter'}
              <!-- Propositions de l'automate, un bouton chacune ; sinon saisie libre. -->
              <div class="flex flex-col gap-1.5">
                {#each t.suggestions ?? [] as s, k (k)}
                  <form method="POST" action="?/valider" use:enhance>
                    <input type="hidden" name="id" value={t.id} /><input type="hidden" name="suggestion" value={k} />
                    <button type="submit" class="inline-flex items-center gap-1.5 rounded border border-border px-2 py-1 text-left text-xs hover:border-foreground">
                      <Check size={12} weight="bold" class="shrink-0 text-success" /> {s.libelle}
                      {#if s.origine === 'catalogue'}<span class="text-muted-foreground">(prix seul)</span>{/if}
                    </button>
                  </form>
                {/each}
                {#if libre === t.id}
                  <form method="POST" action="?/valider" use:enhance class="mt-1 flex flex-col gap-2 rounded-md border border-dashed border-border p-2">
                    <input type="hidden" name="id" value={t.id} />
                    <EntityPicker name="bookIds" searchUrl="/api/books/search" labelField="title" visuel="couverture" placeholder="Chercher un livre…" />
                    <div class="flex flex-wrap items-center gap-2 text-xs">
                      <label>Quantité <input name="qty" type="number" min="1" value="1" class="{input} ml-1 w-16" /></label>
                      <input name="note" placeholder="note (facultatif)" class="{input} min-w-40 flex-1" />
                      <Button type="submit" size="sm">Valider</Button>
                      <button type="button" class="text-muted-foreground hover:underline" onclick={() => (libre = null)}>annuler</button>
                    </div>
                  </form>
                {:else}
                  <button type="button" class="self-start text-xs text-link hover:underline" onclick={() => (libre = t.id)}>
                    {t.suggestions?.length ? 'Autre livre…' : 'Indiquer le livre…'}
                  </button>
                {/if}
              </div>
            {:else}<span class="text-xs text-muted-foreground">—</span>{/if}
          </td>
          <td class="whitespace-nowrap px-4 py-2.5 text-right">
            {#if t.etat === 'a_traiter'}
              <form method="POST" action="?/ignorer" use:enhance class="inline">
                <input type="hidden" name="id" value={t.id} />
                <button type="submit" class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive" title="Pas une vente de livre (adhésion, don, erreur…)"><X size={13} /> Ignorer</button>
              </form>
            {:else}
              <form method="POST" action="?/rouvrir" use:enhance class="inline">
                <input type="hidden" name="id" value={t.id} />
                <button type="submit" class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowCounterClockwise size={13} /> Rouvrir</button>
              </form>
            {/if}
          </td>
        </tr>
      {/each}
      {#if data.encaissements.length === 0}
        <tr><td colspan="5" class="px-4 py-10 text-center text-muted-foreground">
          {data.etat === 'a_traiter' ? 'Rien à traiter.' : 'Aucun encaissement dans cet état.'}
        </td></tr>
      {/if}
    </tbody>
  </table>
</div>
