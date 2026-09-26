<script lang="ts">
  /**
   * Ventes relevées par exercice (année civile), pour une fiche livre ou auteur.
   * Un exercice n'est « complet » que si ses douze mois sont couverts par des
   * relevés et que l'année est révolue : sinon les chiffres sont provisoires et
   * l'année ne peut pas être arrêtée.
   */
  import { Warning } from 'phosphor-svelte';

  interface Exercice {
    annee: number; vendus: number; retours: number; net: number; export: number;
    ca_ht: number; mois_couverts: number; complete: boolean;
    canaux: { code: string; nom: string; vendus: number; retours: number }[];
  }
  let { exercices, titre = 'Ventes par exercice' }: { exercices: Exercice[]; titre?: string } = $props();
  const nb = (n: number) => (n ?? 0).toLocaleString('fr-FR');
  const eur = (n: number) => `${(n ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
</script>

<div class="overflow-hidden rounded-lg border border-border bg-card">
  <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
    <h3 class="text-sm font-semibold">{titre}</h3>
    <a href="/admin/droits/ventes" class="text-xs text-link hover:underline">Relever un exercice</a>
  </div>

  {#if exercices.length === 0}
    <p class="px-4 py-6 text-sm text-muted-foreground">
      Aucune vente relevée. Lancez un relevé depuis <a href="/admin/droits/ventes" class="text-link hover:underline">Ventes de l’exercice</a>.
    </p>
  {:else}
    <table class="w-full text-sm">
      <thead class="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
        <tr>
          <th class="px-4 py-2 text-left font-medium">Exercice</th>
          <th class="px-3 py-2 text-right font-medium">Vendus</th>
          <th class="px-3 py-2 text-right font-medium">Retours</th>
          <th class="px-3 py-2 text-right font-medium">Net</th>
          <th class="px-3 py-2 text-right font-medium">Hors France</th>
          <th class="px-4 py-2 text-right font-medium">Prix public HT</th>
        </tr>
      </thead>
      <tbody>
        {#each exercices as e (e.annee)}
          <tr class="border-t border-border align-top">
            <td class="px-4 py-2">
              <span class="font-medium">{e.annee}</span>
              {#if e.complete}
                <span class="ml-2 text-xs text-muted-foreground">année complète</span>
              {:else}
                <span class="ml-2 inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-500">
                  <Warning size={13} weight="fill" /> {e.mois_couverts}/12 mois relevés
                </span>
              {/if}
              {#if e.canaux.length}
                <p class="mt-0.5 text-xs text-muted-foreground">{e.canaux.map((c) => `${c.nom} ${nb(c.vendus)}`).join(' · ')}</p>
              {/if}
            </td>
            <td class="px-3 py-2 text-right tabular-nums">{nb(e.vendus)}</td>
            <td class="px-3 py-2 text-right tabular-nums">{nb(e.retours)}</td>
            <td class="px-3 py-2 text-right font-medium tabular-nums">{nb(e.net)}</td>
            <td class="px-3 py-2 text-right tabular-nums">{e.export ? nb(e.export) : '—'}</td>
            <td class="px-4 py-2 text-right tabular-nums">{eur(e.ca_ht)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
