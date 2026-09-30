<script lang="ts">
  /**
   * Aperçu des contrats d'un livre, déplié SOUS sa ligne dans la liste : pour
   * chaque personne concernée (directeur de collection compris), ses contrats
   * (périodes successives), leur validité et leur statut. Les ventes ne sont
   * pas ici : c'est le contrat qu'on regarde.
   */
  import { slide } from 'svelte/transition';
  import { ArrowRight, CircleNotch } from 'phosphor-svelte';
  import { ROLE_LABEL } from '$lib/labels';

  let { bookId, slug }: { bookId: string; slug: string } = $props();

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

  const jour = (d?: string) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');
  const validite = (c: any) =>
    c.term_start || c.term_end
      ? `${c.term_start ? `du ${jour(c.term_start)}` : 'depuis l’origine'}${c.term_end ? ` au ${jour(c.term_end)}` : ''}`
      : 'sans limite de date';
  const STATUT: Record<string, string> = { active: 'actif', draft: 'brouillon', ended: 'terminé' };
  const SCOPE: Record<string, string> = { all: 'tous supports', paper: 'papier', ebook: 'numérique' };
  const bareme = (t: any[]) => (t ?? []).length ? t.map((p) => `${p.rate} %${p.up_to ? ` ≤${Number(p.up_to).toLocaleString('fr-FR')}` : ''}`).join(' · ') : 'sans barème';
</script>

<div class="border-l-2 border-link bg-muted/25 px-5 py-4" transition:slide={{ duration: 160 }}>
  {#if erreur}
    <p class="text-sm text-destructive">{erreur}</p>
  {:else if !data}
    <p class="flex items-center gap-2 text-sm text-muted-foreground"><CircleNotch size={15} class="animate-spin" /> Chargement…</p>
  {:else}
    <div class="space-y-3">
      {#each data.contributeurs as p (p.author_id + p.role + (p.user_id ?? ''))}
        {@const n = p.contracts.length}
        {@const portees = new Set(p.contracts.map((c: any) => c.scope)).size}
        <div class="grid gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
          <div class="text-sm">
            <span class="font-medium">{p.author_name}</span>
            <span class="ml-1.5 rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">{ROLE_LABEL[p.role] ?? p.role}</span>
            <p class="text-xs {n ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-500'}">
              {n === 0
                ? 'aucun contrat'
                : n === 1
                  ? '1 période'
                  : portees === n
                    ? `${n} contrats (${n} portées)`
                    : `${n} périodes${portees > 1 ? ` · ${portees} portées` : ' (avenants)'}`}
            </p>
          </div>
          <ul class="space-y-1 text-xs text-muted-foreground">
            {#each p.contracts as c (c.id)}
              <li class="flex flex-wrap gap-x-3">
                <span class="tabular-nums text-foreground">{bareme(c.tiers)}</span>
                <span>{SCOPE[c.scope] ?? c.scope}</span>
                <span>{validite(c)}</span>
                <span class={c.status === 'active' ? 'text-success' : c.status === 'draft' ? 'text-warning' : ''}>{STATUT[c.status] ?? c.status}</span>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
      {#if data.contributeurs.length === 0}<p class="text-sm text-muted-foreground">Aucun contributeur sur ce titre.</p>{/if}
    </div>
    <a href="/admin/droits/contrats/{slug || bookId}" class="mt-4 inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-link">
      Voir le détail <ArrowRight size={14} weight="bold" />
    </a>
  {/if}
</div>
