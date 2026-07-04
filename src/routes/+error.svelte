<script lang="ts">
  import { page } from '$app/state';
  import Logo from '$lib/components/Logo.svelte';
  import { Button } from '$lib/components/ui/button';

  const isDbDown = $derived(page.error?.code === 'DB_DOWN');
  const isForbidden = $derived(page.status === 403 || page.error?.code === 'FORBIDDEN');
  const title = $derived(
    isDbDown ? 'Service momentanément indisponible' :
    isForbidden ? 'Accès refusé' :
    page.status === 404 ? 'Page introuvable' : 'Une erreur est survenue'
  );
</script>

<div class="grid min-h-svh place-items-center bg-muted/30 px-4">
  <div class="w-full max-w-md text-center">
    <div class="mb-6 flex justify-center"><Logo size={34} /></div>
    <div class="rounded-2xl border border-border bg-card p-8">
      <div class="text-5xl font-extrabold text-link">{page.status}</div>
      <h1 class="mt-3 text-lg font-semibold">{title}</h1>
      {#if page.error?.message && !isDbDown}
        <p class="mt-2 text-sm text-muted-foreground">{page.error.message}</p>
      {/if}
      <div class="mt-6 flex justify-center gap-3">
        <Button href="/" variant="outline">Accueil</Button>
        {#if isForbidden}<Button href="/connexion">Connexion</Button>{/if}
      </div>
    </div>
  </div>
</div>
