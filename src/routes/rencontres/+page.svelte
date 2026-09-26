<script lang="ts">
  import PageHead from '$lib/components/PageHead.svelte';
  import EventsExplorer from '$lib/components/EventsExplorer.svelte';
  let { data } = $props();
</script>

<svelte:head><title>Rencontres · Agone</title></svelte:head>

<PageHead eyebrow="L’agenda" title="Rencontres" subtitle="Débats, tables rondes et présentations autour des livres et des auteurs." />

<!-- Même principe que l'accueil : la liste défile, la carte suit. -->
<section class="py-10" style="padding-inline: var(--page-gutter)">
  <!-- Téléphone : la carte vient après la liste, un raccourci y mène. -->
  <p class="mb-3 text-sm lg:hidden"><a href="#carte" class="link">Voir la carte des rencontres ↓</a></p>
  <EventsExplorer events={data.events} />
</section>
