<script lang="ts">
  import PageHead from '$lib/components/PageHead.svelte';
  let { data } = $props();
</script>

<svelte:head><title>Désabonnement · Agone</title></svelte:head>

<PageHead eyebrow="Lettre d’information" title="Désabonnement" />

<section class="mx-auto max-w-xl px-4 py-14 sm:px-6">
  {#if data.done}
    <div class="border-l-2 border-link bg-secondary/40 p-6">
      <h2 class="display-title text-2xl">C’est fait</h2>
      <p class="mt-2 text-muted-foreground">{data.email} ne recevra plus la lettre d’information des Éditions Agone. Vous pouvez vous réabonner à tout moment.</p>
      <a href="/newsletter" class="link mt-4 inline-block text-sm font-medium">Me réabonner →</a>
    </div>
  {:else}
    <div class="border-l-2 border-border bg-secondary/40 p-6">
      <h2 class="display-title text-2xl">Lien invalide</h2>
      <p class="mt-2 text-muted-foreground">Ce lien de désabonnement est invalide ou expiré. Si vous souhaitez ne plus recevoir nos envois, contactez-nous.</p>
      <a href="/contact" class="link mt-4 inline-block text-sm font-medium">Nous contacter →</a>
    </div>
  {/if}
</section>
