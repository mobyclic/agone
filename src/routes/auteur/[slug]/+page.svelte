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
    <div class="grid gap-8 sm:items-start {a.portrait_url ? 'sm:grid-cols-[minmax(0,280px)_minmax(0,1fr)]' : ''} {data.rencontres.length ? '' : 'lg:col-span-2'}">
      <!-- Portrait + repères — seulement s'il y a un portrait : sans photo, rien
           à gauche, le texte prend la largeur. -->
      {#if a.portrait_url}
      <div use:colonneCollante>
        <div class="aspect-[4/5] w-full max-w-[280px] overflow-hidden border border-border bg-muted">
          <img src={a.portrait_url} alt={a.full_name} class="size-full object-cover" />
        </div>
        {#if a.portrait_credit || a.portrait_license}
          <!-- Mention imposée par la licence libre de la photo. -->
          <p class="mt-1.5 max-w-[280px] text-[11px] leading-snug text-muted-foreground">
            {#if a.portrait_source}<a href={a.portrait_source} target="_blank" rel="noopener" class="hover:text-foreground">Photo</a>{:else}Photo{/if}
            {#if a.portrait_credit}: {a.portrait_credit}{/if}{#if a.portrait_license} · {a.portrait_license}{/if}
          </p>
        {/if}

        <dl class="mt-6 max-w-[280px] space-y-3 text-sm">
          {#if a.nationality}<div class="flex justify-between gap-3"><dt class="text-muted-foreground">Nationalité</dt><dd class="text-right font-medium">{a.nationality}</dd></div>{/if}
          {#if years}<div class="flex justify-between gap-3"><dt class="text-muted-foreground">Dates</dt><dd class="font-medium">{years}</dd></div>{/if}
          {#if a.website}
            <div><a href={a.website} target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 font-medium text-link hover:underline"><ArrowSquareOut size={14} /> Site web</a></div>
          {/if}
        </dl>
      </div>
      {/if}

      <!-- Contenu -->
      <div class="min-w-0">
        <nav class="mb-3 font-display text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <a href="/auteurs" class="hover:text-foreground">Auteurs</a>
        </nav>
        <h1 class="display-title text-3xl leading-tight sm:text-4xl">{a.full_name}</h1>
        {#if !a.portrait_url && (a.nationality || years || a.website)}
          <!-- Sans portrait, les repères de la colonne de gauche viennent ici. -->
          <p class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {#if a.nationality}<span>{a.nationality}</span>{/if}
            {#if years}<span>{years}</span>{/if}
            {#if a.website}<a href={a.website} target="_blank" rel="noopener" class="inline-flex items-center gap-1 font-medium text-link hover:underline"><ArrowSquareOut size={14} /> Site web</a>{/if}
          </p>
        {/if}
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

    <!-- Colonne latérale : rencontres à venir -->
    {#if data.rencontres.length}
      <aside use:colonneCollante class="space-y-8">
        <RencontresAVenir rencontres={data.rencontres} />
      </aside>
    {/if}
  </div>
</div>
