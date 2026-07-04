<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  let { data, form } = $props();
  const p = $derived(data.profile ?? {});
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const lbl = 'mb-1 block text-xs font-medium text-muted-foreground';
</script>

<svelte:head><title>Mon profil · Agone</title></svelte:head>

<h2 class="text-xl font-bold">Mon profil</h2>

<div class="mt-6 max-w-xl space-y-6">
  <form method="POST" action="?/profile" use:enhance class="rounded-lg border border-border bg-card p-5">
    <h3 class="eyebrow mb-4">Informations</h3>
    <div class="grid gap-3 sm:grid-cols-2">
      <label class={lbl}>Prénom <input name="first_name" value={p.first_name ?? ''} class={input} /></label>
      <label class={lbl}>Nom <input name="last_name" value={p.last_name ?? ''} class={input} /></label>
      <label class="{lbl} sm:col-span-2">Email <input value={p.email ?? ''} disabled class="{input} opacity-60" /></label>
      <label class="{lbl} sm:col-span-2">Téléphone <input name="phone" value={p.phone ?? ''} class={input} /></label>
    </div>
    <label class="mt-3 flex items-center gap-2 text-sm">
      <input type="checkbox" name="newsletter" checked={p.accepts_newsletter} class="size-4 rounded border-border" /> Recevoir la lettre d’information
    </label>
    <Button type="submit" class="mt-4">Enregistrer</Button>
  </form>

  <form method="POST" action="?/password" use:enhance class="rounded-lg border border-border bg-card p-5">
    <h3 class="eyebrow mb-4">Mot de passe</h3>
    {#if form?.pwerror}<p class="mb-3 rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.pwerror}</p>{/if}
    <label class={lbl}>Nouveau mot de passe <input name="password" type="password" minlength="8" class={input} autocomplete="new-password" /></label>
    <Button type="submit" variant="outline" class="mt-4">Changer le mot de passe</Button>
  </form>
</div>
