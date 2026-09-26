<script lang="ts">
  /**
   * Aperçu des droits d'un livre, ouvert depuis la liste des contrats : qui est
   * sous contrat et à quelles conditions, ce que le titre a vendu par exercice,
   * et ses mouvements de stock. Le détail (édition des contrats) reste sur sa
   * propre page, accessible par le bouton.
   */
  import { fade, scale } from 'svelte/transition';
  import { X, ArrowRight, CircleNotch } from 'phosphor-svelte';
  import { ROLE_LABEL } from '$lib/labels';

  interface Livre { id: string; title: string; cover_url?: string; published_at?: string }
  let { livre = $bindable(null) }: { livre?: Livre | null } = $props();

  const bookId = $derived(livre ? String(livre.id).replace('book:', '') : '');
  let data = $state<any>(null);
  let erreur = $state('');

  $effect(() => {
    const id = bookId;
    if (!id) return;
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

  const fermer = () => (livre = null);
  const nb = (n: number) => (n ?? 0).toLocaleString('fr-FR');
  const jour = (d?: string) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');
  const eur = (n: number) => `${(n ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  /** Barème résumé : « 6 % ≤2 000 · 8 % ≤5 000 · 10 % ». */
  const bareme = (tiers: any[]) =>
    (tiers ?? []).length
      ? tiers.map((t) => `${t.rate} %${t.up_to ? ` ≤${nb(t.up_to)}` : ''}`).join(' · ')
      : '—';
  const validite = (c: any) =>
    c.term_start || c.term_end
      ? `${c.term_start ? `du ${jour(c.term_start)}` : 'depuis l’origine'} ${c.term_end ? `au ${jour(c.term_end)}` : ''}`.trim()
      : 'sans limite de date';
</script>

<svelte:window onkeydown={(e: KeyboardEvent) => { if (livre && e.key === 'Escape') fermer(); }} />

{#if livre}
  <div class="fixed inset-0 z-[70] grid place-items-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Aperçu : {livre.title}">
    <button type="button" class="absolute inset-0 cursor-default bg-black/60" aria-label="Fermer" onclick={fermer} transition:fade={{ duration: 120 }}></button>

    <div class="relative z-10 max-h-[92svh] w-full max-w-[52rem] overflow-y-auto rounded-lg border border-border bg-background shadow-2xl"
      transition:scale={{ duration: 160, start: 0.97, opacity: 0 }}>
      <button type="button" onclick={fermer} class="absolute right-3 top-3 grid size-9 place-items-center text-muted-foreground hover:text-foreground" aria-label="Fermer">
        <X size={20} />
      </button>

      <div class="flex gap-4 border-b border-border p-5">
        <div class="w-16 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
          {#if livre.cover_url}
            <img src={livre.cover_url} alt="" class="block aspect-[2/3] w-full object-cover" />
          {:else}
            <span class="block aspect-[2/3] w-full bg-ink"></span>
          {/if}
        </div>
        <div class="min-w-0 flex-1">
          <h2 class="pr-8 text-lg font-bold leading-tight">{livre.title}</h2>
          {#if livre.published_at}
            <p class="mt-0.5 text-sm text-muted-foreground">Paru le {jour(livre.published_at)}</p>
          {/if}
          <a href="/admin/droits/contrats/{bookId}"
            class="mt-3 inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-link">
            Voir le détail <ArrowRight size={14} weight="bold" />
          </a>
        </div>
      </div>

      {#if erreur}
        <p class="p-6 text-sm text-destructive">{erreur}</p>
      {:else if !data}
        <p class="flex items-center gap-2 p-6 text-sm text-muted-foreground"><CircleNotch size={16} class="animate-spin" /> Chargement…</p>
      {:else}
        <div class="space-y-6 p-5">
          <!-- Contrats -->
          <section>
            <h3 class="eyebrow mb-2">Contrats</h3>
            {#if data.contrats.length === 0}
              <p class="text-sm text-muted-foreground">Aucun contrat pour ce titre.</p>
            {:else}
              <table class="w-full text-sm">
                <tbody class="divide-y divide-border">
                  {#each data.contrats as c (c.id)}
                    <tr>
                      <td class="py-1.5 pr-3 font-medium">{c.author_name}</td>
                      <td class="py-1.5 pr-3 text-muted-foreground">{ROLE_LABEL[c.role] ?? c.role}</td>
                      <td class="py-1.5 pr-3 tabular-nums">{bareme(c.tiers)}</td>
                      <td class="py-1.5 pr-3 text-xs text-muted-foreground">{validite(c)}</td>
                      <td class="py-1.5 text-right text-xs text-muted-foreground">
                        {c.status === 'active' ? '' : c.status === 'ended' ? 'terminé' : 'brouillon'}
                        {#if c.advance}<span class="ml-1">à-valoir {eur(c.advance)}</span>{/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </section>

          <!-- Ventes par exercice -->
          <section>
            <h3 class="eyebrow mb-2">Ventes par exercice</h3>
            {#if data.ventes.length === 0}
              <p class="text-sm text-muted-foreground">Aucune vente relevée.</p>
            {:else}
              <table class="w-full text-sm">
                <thead class="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th class="py-1 text-left font-medium">Exercice</th><th class="py-1 text-right font-medium">Vendus</th>
                    <th class="py-1 text-right font-medium">Retours</th><th class="py-1 text-right font-medium">Net</th>
                    <th class="py-1 text-right font-medium">Prix public HT</th></tr>
                </thead>
                <tbody class="divide-y divide-border">
                  {#each data.ventes as e (e.annee)}
                    <tr>
                      <td class="py-1.5">{e.annee}
                        {#if !e.complete}<span class="ml-1 text-xs text-muted-foreground">({e.mois_couverts}/12 mois)</span>{/if}
                      </td>
                      <td class="py-1.5 text-right tabular-nums">{nb(e.vendus)}</td>
                      <td class="py-1.5 text-right tabular-nums">{nb(e.retours)}</td>
                      <td class="py-1.5 text-right font-medium tabular-nums">{nb(e.net)}</td>
                      <td class="py-1.5 text-right tabular-nums">{eur(e.ca_ht)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </section>

          <!-- Mouvements de stock -->
          <section>
            <h3 class="eyebrow mb-2">Mouvements de stock</h3>
            {#if data.mouvements.length === 0}
              <p class="text-sm text-muted-foreground">Aucun relevé de mouvements.</p>
            {:else}
              <table class="w-full text-sm">
                <thead class="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th class="py-1 text-left font-medium">Période</th><th class="py-1 text-right font-medium">Stock début</th>
                    <th class="py-1 text-right font-medium">Entrées</th><th class="py-1 text-right font-medium">SP</th>
                    <th class="py-1 text-right font-medium">Stock fin</th></tr>
                </thead>
                <tbody class="divide-y divide-border">
                  {#each data.mouvements as m (m.period_start)}
                    <tr>
                      <td class="py-1.5">{jour(m.period_start)} → {jour(m.period_end)}</td>
                      <td class="py-1.5 text-right tabular-nums">{nb(m.stock_start)}</td>
                      <td class="py-1.5 text-right tabular-nums">{nb(m.entries)}</td>
                      <td class="py-1.5 text-right tabular-nums">{nb(m.free_copies)}</td>
                      <td class="py-1.5 text-right tabular-nums">{nb(m.stock_end)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </section>
        </div>
      {/if}
    </div>
  </div>
{/if}
