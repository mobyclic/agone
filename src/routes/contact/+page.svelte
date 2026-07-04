<script lang="ts">
  import StaticPage from '$lib/components/StaticPage.svelte';
  import { EnvelopeSimple } from 'phosphor-svelte';
  let { data } = $props();
</script>

<svelte:head><title>Contact · Agone</title></svelte:head>

<StaticPage title="Contact" html={data.html}>
  <div class="mt-8 grid gap-4 sm:grid-cols-2">
    <div class="rounded-lg border border-border bg-card p-5">
      <div class="eyebrow">Écrire à la maison</div>
      <a href="mailto:contact@agone.org" class="mt-2 inline-flex items-center gap-2 font-semibold text-link hover:underline">
        <EnvelopeSimple size={18} /> contact@agone.org
      </a>
    </div>
    <div class="rounded-lg border border-border bg-card p-5">
      <div class="eyebrow">Éditions Agone</div>
      <p class="mt-2 text-sm text-muted-foreground">Marseille — France</p>
      <p class="mt-1 text-sm text-muted-foreground">Diffusion / distribution : Les Belles Lettres.</p>
    </div>
  </div>
</StaticPage>
