<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { ArrowRight } from 'phosphor-svelte';

  let { data } = $props();
</script>

<svelte:head>
  <title>Agone — éditeur engagé</title>
  <meta name="description" content="Éditions Agone — sciences sociales, histoire, littérature et critique du présent. Marseille." />
</svelte:head>

<!-- Hero -->
<section class="relative overflow-hidden bg-sidebar text-sidebar-foreground">
  <div class="bg-grid-fade absolute inset-0 opacity-[0.12]"></div>
  <div class="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32">
    <p class="eyebrow" style="color:var(--sidebar-primary)">Éditeur engagé — Marseille</p>
    <h1 class="mt-4 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
      Des livres pour comprendre&nbsp;— et transformer&nbsp;— le monde.
    </h1>
    <p class="mt-5 max-w-xl text-lg text-sidebar-foreground/70">
      Sciences sociales, histoire, littérature et critique du présent. Retrouvez tout le catalogue
      des Éditions Agone, les auteurs, les rencontres et votre bibliothèque numérique.
    </p>
    <div class="mt-8 flex flex-wrap gap-3">
      <Button href="/catalogue" variant="brand" size="lg">Explorer le catalogue <ArrowRight size={18} /></Button>
      <Button href="/a-propos" variant="outline" size="lg" class="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent">
        La maison
      </Button>
    </div>
  </div>
</section>

<!-- Bandeau chantier (Phase 0) -->
<section class="mx-auto max-w-7xl px-4 py-16 sm:px-6">
  <div class="rounded-2xl border border-border bg-card p-8">
    <p class="eyebrow">Agone 2.0</p>
    <h2 class="mt-2 text-2xl font-bold">Le nouveau site se construit.</h2>
    <p class="mt-2 max-w-2xl text-muted-foreground">
      Cette page est la fondation (Phase 0) de la refonte : socle technique, comptes et back-office.
      Le catalogue, la boutique et la bibliothèque numérique arrivent dans les prochaines phases.
    </p>
    {#if data.user}
      <div class="mt-6 flex flex-wrap gap-3">
        {#if data.user.role === 'admin' || data.user.role === 'editor'}
          <Button href="/admin">Accéder au back-office</Button>
        {/if}
        <span class="inline-flex items-center rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground">
          Connecté : {data.user.full_name || data.user.email}
        </span>
      </div>
    {:else}
      <div class="mt-6 flex flex-wrap gap-3">
        <Button href="/inscription" variant="brand">Créer un compte</Button>
        <Button href="/connexion" variant="outline">Se connecter</Button>
      </div>
    {/if}
  </div>
</section>
