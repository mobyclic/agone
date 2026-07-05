<script lang="ts">
  import { enhance } from '$app/forms';
  import PageHead from '$lib/components/PageHead.svelte';
  let { form } = $props();
  let done = $state(false);
</script>

<svelte:head><title>Lettre d’information · Agone</title></svelte:head>

<PageHead eyebrow="Rester en lien" title="Lettre d’information" subtitle="Nouveautés, rencontres et textes de L’Antichambre — quelques envois par mois, jamais de spam." />

<section class="mx-auto max-w-xl px-4 py-14 sm:px-6">
  {#if done}
    <div class="border-l-2 border-link bg-secondary/40 p-6">
      <h2 class="display-title text-2xl">Merci !</h2>
      <p class="mt-2 text-muted-foreground">Votre inscription est prise en compte. Vous pouvez vous désabonner à tout moment depuis le lien présent en bas de chaque envoi.</p>
    </div>
  {:else}
    {#if form?.error}<p class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}
    <form
      method="POST"
      use:enhance={() => async ({ result, update }) => { if (result.type === 'success') done = true; else await update(); }}
      class="space-y-3"
    >
      <input type="hidden" name="source" value="page" />
      <div class="grid gap-3 sm:grid-cols-2">
        <input name="first_name" placeholder="Prénom (facultatif)" class="h-11 w-full border border-border bg-background px-3.5 text-sm outline-none focus:border-foreground" />
        <input name="email" type="email" required placeholder="Votre e-mail" value={form?.email ?? ''} class="h-11 w-full border border-border bg-background px-3.5 text-sm outline-none focus:border-foreground" />
      </div>
      <button type="submit" class="btn-brand h-11 px-5 font-display text-sm font-medium uppercase tracking-wide">S’abonner</button>
      <p class="text-xs text-muted-foreground">En vous inscrivant, vous acceptez de recevoir la lettre d’information des Éditions Agone. Vos données ne sont ni vendues ni cédées.</p>
    </form>
  {/if}
</section>
