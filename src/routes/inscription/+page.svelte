<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import Logo from '$lib/components/Logo.svelte';
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

<div class="grid min-h-[calc(100svh-4rem)] lg:grid-cols-2">
  <div class="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex">
    <div class="bg-grid-fade absolute inset-0 opacity-[0.15]"></div>
    <a href="/" class="relative"><Logo tone="light" size={34} /></a>
    <div class="relative">
      <h2 class="max-w-sm text-3xl font-extrabold leading-tight tracking-tight">Rejoignez Agone.</h2>
      <p class="mt-3 max-w-sm text-sidebar-foreground/70">Un compte pour commander, retrouver vos ebooks et suivre la maison.</p>
      <ul class="mt-6 space-y-2 text-sm text-sidebar-foreground/80">
        <li>• Votre bibliothèque numérique, re-téléchargeable à vie</li>
        <li>• Le suivi de vos commandes et vos factures</li>
        <li>• La lettre d’information (optionnelle)</li>
      </ul>
    </div>
    <p class="relative text-xs text-sidebar-foreground/50">Agone — éditeur engagé.</p>
  </div>

  <div class="flex items-center justify-center p-6 sm:p-12">
    <div class="w-full max-w-md">
      <div class="mb-8 lg:hidden"><Logo size={30} /></div>
      <h1 class="text-2xl font-bold">Créer un compte</h1>
      <p class="mt-1 text-sm text-muted-foreground">Quelques informations et c’est parti.</p>

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
        <a href="/connexion{page.url.search}" class="font-medium text-primary hover:underline">Se connecter</a>
      </p>
    </div>
  </div>
</div>
