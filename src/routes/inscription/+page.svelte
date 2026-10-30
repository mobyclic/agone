<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';

  let { form } = $props();

  const errText = $derived(
    form?.error === 'email_taken'
      ? 'Un compte existe déjà avec cet email.'
      : form?.error === 'weak_password'
        ? 'Le mot de passe doit faire au moins 8 caractères.'
        : form?.error
          ? 'Une erreur est survenue.'
          : ''
  );
  const inputCls =
    'h-11 w-full rounded-md border border-border bg-background px-3.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15';
</script>

<svelte:head><title>Créer un compte · Agone</title></svelte:head>

<div class="flex min-h-[calc(100svh-14rem)] items-center justify-center px-4 py-16">
  <div class="w-full max-w-md">
    <h1 class="text-center text-2xl font-bold">Créer un compte</h1>
    <p class="mt-1 text-center text-sm text-muted-foreground">Quelques informations et c’est parti.</p>

    {#if errText}
      <p class="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{errText}</p>
    {/if}

    <form method="POST" action={page.url.search} use:enhance class="mt-6 space-y-4">
      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="mb-1.5 block text-sm font-medium">Prénom</span>
          <input name="first_name" value={form?.first_name ?? ''} class={inputCls} autocomplete="given-name" />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-sm font-medium">Nom</span>
          <input name="last_name" value={form?.last_name ?? ''} class={inputCls} autocomplete="family-name" />
        </label>
      </div>
      <label class="block">
        <span class="mb-1.5 block text-sm font-medium">Email</span>
        <input name="email" type="email" required value={form?.email ?? ''} class={inputCls} autocomplete="email" />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-sm font-medium">Mot de passe</span>
        <input name="password" type="password" required minlength="8" class={inputCls} autocomplete="new-password" />
      </label>
      <label class="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" name="newsletter" checked class="size-4 rounded border-border" />
        Je souhaite recevoir la lettre d’information
      </label>
      <Button type="submit" variant="brand" class="w-full" size="lg">Créer mon compte</Button>
    </form>

    <p class="mt-6 text-center text-sm text-muted-foreground">
      Déjà un compte ?
      <a href="/connexion{page.url.search}" class="font-medium text-link hover:underline">Se connecter</a>
    </p>
  </div>
</div>
