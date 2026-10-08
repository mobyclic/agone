<script lang="ts">
  /**
   * Fiche auteur — même gabarit que la fiche livre : portrait (et repères) à
   * gauche, biographie puis livres au centre, rencontres à venir à droite.
   */
  import { page } from '$app/state';
  import { colonneCollante } from '$lib/client/sticky';
  import { Button } from '$lib/components/ui/button';
  import CouverturesGrille from '$lib/components/CouverturesGrille.svelte';
  import RencontresAVenir from '$lib/components/RencontresAVenir.svelte';
  import ArticlesAuteur from '$lib/components/ArticlesAuteur.svelte';
  import { PencilSimple, ArrowSquareOut } from 'phosphor-svelte';

  let { data } = $props();
  const a = $derived(data.author);
  const isStaff = $derived(['admin', 'editor'].includes(page.data.user?.role ?? ''));
  const years = $derived(a.birth_year || a.death_year ? `${a.birth_year ?? ''}–${a.death_year ?? ''}` : null);
  const livres = $derived(a.works.find((g) => g.role === 'author')?.books ?? []);
  const contributions = $derived(a.works.filter((g) => g.role !== 'author' && g.books.length));
</script>

<svelte:head><title>{a.full_name} · Agone</title></svelte:head>

{#if isStaff && a.slug}
  <div class="fixed bottom-6 right-6 z-40">
    <Button href="/admin/auteurs/{a.slug}" variant="outline" class="bg-background shadow-2xl"><PencilSimple size={16} /> Éditer</Button>
  </div>
{/if}

<!-- Comme la fiche livre : pas de gros en-tête, le nom vit dans la colonne de contenu. -->
<div class="py-8" style="padding-inline: var(--page-gutter)">
  <div class="grid gap-8 lg:grid-cols-[2fr_1fr] lg:items-start lg:gap-12">
    <!-- Sans rencontre à venir, la colonne de droite serait vide : le contenu prend toute la largeur. -->
    <div class="grid gap-8 sm:grid-cols-[minmax(0,280px)_minmax(0,1fr)] sm:items-start {data.rencontres.length || data.articles.length ? '' : 'lg:col-span-2'}">
      <!-- Portrait + repères. Sans photo, la colonne reste (le texte garde sa
           mesure et son alignement d'une fiche à l'autre) mais aucun cadre de
           remplacement n'y est posé. Sur téléphone, vide, elle ne prend pas de place. -->
      <div use:colonneCollante class="min-w-0 {a.portrait_url || a.nationality || years || a.website ? '' : 'max-sm:hidden'}">
        {#if a.portrait_url}
          <div class="aspect-[4/5] w-full max-w-[280px] overflow-hidden border border-border bg-muted">
            <img src={a.portrait_url} alt={a.full_name} class="size-full object-cover" />
          </div>
        {/if}
        {#if a.portrait_credit || a.portrait_license}
          <!-- Mention imposée par la licence libre de la photo. -->
          <p class="mt-1.5 max-w-[280px] text-[11px] leading-snug text-muted-foreground [overflow-wrap:anywhere]">
            {#if a.portrait_source}<a href={a.portrait_source} target="_blank" rel="noopener" class="hover:text-foreground">Photo</a>{:else}Photo{/if}
            {#if a.portrait_credit}: {a.portrait_credit}{/if}{#if a.portrait_license} · {a.portrait_license}{/if}
          </p>
        {/if}

        <dl class="{a.portrait_url ? 'mt-6' : ''} max-w-[280px] space-y-3 text-sm">
          {#if a.nationality}<div class="flex justify-between gap-3"><dt class="text-muted-foreground">Nationalité</dt><dd class="text-right font-medium">{a.nationality}</dd></div>{/if}
          {#if years}<div class="flex justify-between gap-3"><dt class="text-muted-foreground">Dates</dt><dd class="font-medium">{years}</dd></div>{/if}
          {#if a.website}
            <div><a href={a.website} target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 font-medium text-link hover:underline"><ArrowSquareOut size={14} /> Site web</a></div>
          {/if}
        </dl>
      </div>

      <!-- Contenu -->
      <div class="min-w-0">
        <nav class="mb-3 font-display text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <a href="/auteurs" class="hover:text-foreground">Auteurs</a>
        </nav>
        <h1 class="display-title text-3xl leading-tight sm:text-4xl">{a.full_name}</h1>
        {#if a.bio_html}
          <div class="prose-agone texte-justifie mt-7 max-w-4xl text-[17px] leading-relaxed text-foreground/90 [&_a]:text-link [&_a:hover]:underline [&_p]:mb-3.5">
            {@html a.bio_html}
          </div>
        {:else}
          <p class="mt-7 text-muted-foreground">Biographie à venir.</p>
        {/if}

        <!-- Ses livres puis ses autres contributions, sous la bio — mêmes tailles de
             couvertures que dans la colonne latérale (grandes / petites). -->
        <div class="mt-10 space-y-8">
          {#if livres.length}
            <div>
              <div class="tick-label mb-3">Ses livres</div>
              <CouverturesGrille livres={livres} colonnes={2} etendu />
            </div>
          {/if}
          {#each contributions as g (g.role)}
            <div>
              <div class="tick-label mb-3">{g.role_label}</div>
              <CouverturesGrille livres={g.books} colonnes={3} etendu />
            </div>
          {/each}
        </div>
      </div>
    </div>

    <!-- Colonne latérale : rencontres à venir, puis ses textes dans l'Antichambre -->
    {#if data.rencontres.length || data.articles.length}
      <aside use:colonneCollante class="space-y-8">
        <RencontresAVenir rencontres={data.rencontres} />
        <ArticlesAuteur articles={data.articles} nom={a.full_name} />
      </aside>
    {/if}
  </div>
</div>
