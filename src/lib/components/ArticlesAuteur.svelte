<script lang="ts">
  /** Bloc de colonne latérale (fiche auteur) : ses textes dans l'Antichambre, signés ou le citant. */
  import type { ArticleAuteur } from '$lib/server/articles';
  let { articles, nom }: { articles: ArticleAuteur[]; nom: string } = $props();

  const date = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  // Cinq d'abord : au-delà, le bloc repousserait le reste de la colonne hors de vue.
  const VISIBLES = 5;
  let tout = $state(false);
</script>

{#if articles.length}
  <div>
    <div class="tick-label mb-3">Lire sur Antichambre</div>
    <ul class="max-w-[400px] divide-y divide-border border-y border-border">
      {#each tout ? articles : articles.slice(0, VISIBLES) as a (a.id)}
        <li>
          <a href="/article/{a.slug}" class="group block py-3">
            <span class="block font-display text-[11px] font-semibold uppercase tracking-wide text-link">{a.rubrique_name ?? 'Antichambre'}</span>
            <span class="mt-0.5 block font-display text-base font-medium uppercase leading-tight decoration-1 underline-offset-4 group-hover:underline">{a.title}</span>
            <span class="mt-1 block text-xs text-muted-foreground">{date(a.published_at)}{a.published_at ? ' · ' : ''}{a.ecrit ? `par ${nom}` : `${nom} y est cité`}</span>
          </a>
        </li>
      {/each}
    </ul>
    {#if articles.length > VISIBLES}
      <button type="button" onclick={() => (tout = !tout)} class="mt-2 text-xs text-muted-foreground underline-offset-4 hover:underline">
        {tout ? 'Voir moins' : `Voir les ${articles.length} textes`}
      </button>
    {/if}
  </div>
{/if}
