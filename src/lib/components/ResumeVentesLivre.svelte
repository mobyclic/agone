<script lang="ts">
  /**
   * Résumé des ventes d'un livre, déplié SOUS sa ligne dans la liste des
   * contrats : un exercice par ligne, avec le détail par canal. Les contrats,
   * la provision et les mouvements de stock sont sur la fiche du titre.
   */
  import { slide } from 'svelte/transition';
  import { ArrowRight, CircleNotch, Warning } from 'phosphor-svelte';

  let { bookId }: { bookId: string } = $props();

  let data = $state<any>(null);
  let erreur = $state('');
  $effect(() => {
    const id = bookId;
    data = null; erreur = '';
    let vivant = true;
    (async () => {
      try {
        const r = await fetch(`/admin/droits/api/livre/${id}`);
        if (!r.ok) throw new Error();
        const j = await r.json();
        if (vivant) data = j;
      } catch { if (vivant) erreur = 'Chargement impossible.'; }
    })();
    return () => { vivant = false; };
  });

  const nb = (n: number) => (n ?? 0).toLocaleString('fr-FR');
  const eur = (n: number) => `${(n ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
</script>

<div class="border-l-2 border-link bg-muted/25 px-5 py-4" transition:slide={{ duration: 160 }}>
  {#if erreur}
    <p class="text-sm text-destructive">{erreur}</p>
  {:else if !data}
    <p class="flex items-center gap-2 text-sm text-muted-foreground"><CircleNotch size={15} class="animate-spin" /> Chargement…</p>
  {:else}
    <div class="flex flex-wrap items-baseline justify-between gap-3">
      <h4 class="eyebrow">Ventes par exercice</h4>
      <span class="text-xs text-muted-foreground">
        {data.contrats.length === 0
          ? 'aucun contrat pour ce titre'
          : data.contrats.length === 1 ? '1 contrat' : `${data.contrats.length} contrats`}
      </span>
    </div>

    {#if data.ventes.length === 0}
      <p class="mt-1.5 text-sm text-muted-foreground">
        Aucune vente relevée. Lancez un relevé depuis <a href="/admin/droits/ventes" class="text-link hover:underline">Ventes de l’exercice</a>.
      </p>
    {:else}
      <table class="mt-1.5 w-full text-sm">
        <thead class="text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th class="py-1 text-left font-medium">Exercice</th>
            <th class="py-1 text-right font-medium">Vendus</th>
            <th class="py-1 text-right font-medium">Retours</th>
            <th class="py-1 text-right font-medium">Net</th>
            <th class="py-1 text-right font-medium">Hors France</th>
            <th class="py-1 text-right font-medium">Prix public HT</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          {#each data.ventes as e (e.annee)}
            <tr class="align-top">
              <td class="py-1.5">
                <span class="font-medium">{e.annee}</span>
                {#if !e.complete}
                  <span class="ml-1 inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-500">
                    <Warning size={12} weight="fill" /> {e.mois_couverts}/12 mois
                  </span>
                {/if}
                {#if e.canaux.length}
                  <p class="text-xs text-muted-foreground">{e.canaux.map((c: any) => `${c.nom} ${nb(c.vendus)}`).join(' · ')}</p>
                {/if}
              </td>
              <td class="py-1.5 text-right tabular-nums">{nb(e.vendus)}</td>
              <td class="py-1.5 text-right tabular-nums">{nb(e.retours)}</td>
              <td class="py-1.5 text-right font-medium tabular-nums">{nb(e.net)}</td>
              <td class="py-1.5 text-right tabular-nums">{e.export ? nb(e.export) : '—'}</td>
              <td class="py-1.5 text-right tabular-nums">{eur(e.ca_ht)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    <a href="/admin/droits/contrats/{bookId}"
      class="mt-3 inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-link">
      Voir le détail <ArrowRight size={14} weight="bold" />
    </a>
  {/if}
</div>
