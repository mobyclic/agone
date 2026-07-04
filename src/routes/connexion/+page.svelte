<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import Logo from '$lib/components/Logo.svelte';
  import { Button } from '$lib/components/ui/button';
  import { EnvelopeSimple, Lock } from 'phosphor-svelte';

  let { form } = $props();

  let mode = $state<'magic' | 'password'>('magic');
  let step = $state<'request' | 'verify'>('request');
  let email = $state('');

  $effect(() => {
    if (form?.mode === 'password' || form?.mode === 'otp') mode = form.mode === 'otp' ? 'magic' : 'password';
    if (form?.step === 'verify') step = 'verify';
    if (form?.email) email = form.email;
  });

  const errText = $derived(
    form?.error === 'invalid_credentials'
      ? 'Email ou mot de passe incorrect.'
      : form?.error === 'invalid_code'
        ? 'Code invalide ou expiré.'
        : form?.error
          ? 'Une erreur est survenue.'
          : ''
  );
  const inputCls =
    'h-11 w-full rounded-md border border-border bg-background px-3.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15';
</script>

<svelte:head><title>Connexion · Agone</title></svelte:head>

<div class="grid min-h-[calc(100svh-4rem)] lg:grid-cols-2">
  <!-- Panneau marque -->
  <div class="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex">
    <div class="bg-grid-fade absolute inset-0 opacity-[0.15]"></div>
    <a href="/" class="relative"><Logo tone="light" size={34} /></a>
    <div class="relative">
      <h2 class="max-w-sm text-3xl font-extrabold leading-tight tracking-tight">Content de vous revoir.</h2>
      <p class="mt-3 max-w-sm text-sidebar-foreground/70">Retrouvez votre bibliothèque, vos commandes et vos téléchargements.</p>
    </div>
    <p class="relative text-xs text-sidebar-foreground/50">Agone — éditeur engagé.</p>
  </div>

  <!-- Formulaire -->
  <div class="flex items-center justify-center p-6 sm:p-12">
    <div class="w-full max-w-sm">
      <div class="mb-8 lg:hidden"><Logo size={30} /></div>
      <h1 class="text-2xl font-bold">Connexion</h1>
      <p class="mt-1 text-sm text-muted-foreground">Accédez à votre compte Agone.</p>

      <div class="mt-6 inline-flex w-full rounded-md border border-border p-1 text-sm">
        <button
          class="flex-1 rounded px-3 py-1.5 font-medium transition-colors {mode === 'magic' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}"
          onclick={() => { mode = 'magic'; step = 'request'; }}
        >Lien magique</button>
        <button
          class="flex-1 rounded px-3 py-1.5 font-medium transition-colors {mode === 'password' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}"
          onclick={() => (mode = 'password')}
        >Mot de passe</button>
      </div>

      {#if errText}
        <p class="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{errText}</p>
      {/if}

      {#if mode === 'password'}
        <form method="POST" action="?/password{page.url.search}" use:enhance class="mt-5 space-y-4">
          <label class="block">
            <span class="mb-1.5 block text-sm font-medium">Email</span>
            <input name="email" type="email" required bind:value={email} class={inputCls} autocomplete="email" />
          </label>
          <label class="block">
            <span class="mb-1.5 block text-sm font-medium">Mot de passe</span>
            <input name="password" type="password" required class={inputCls} autocomplete="current-password" />
          </label>
          <Button type="submit" class="w-full" size="lg"><Lock size={16} /> Se connecter</Button>
        </form>
      {:else if step === 'request'}
        <form method="POST" action="?/request_otp{page.url.search}" use:enhance class="mt-5 space-y-4">
          <label class="block">
            <span class="mb-1.5 block text-sm font-medium">Email</span>
            <input name="email" type="email" required bind:value={email} class={inputCls} autocomplete="email" />
          </label>
          <Button type="submit" class="w-full" size="lg"><EnvelopeSimple size={16} /> Recevoir un lien de connexion</Button>
        </form>
      {:else}
        <p class="mt-5 rounded-md bg-secondary px-3 py-2.5 text-sm">Un email vous a été envoyé avec un lien et un code.</p>
        <form method="POST" action="?/verify_otp{page.url.search}" use:enhance class="mt-4 space-y-4">
          <input type="hidden" name="email" value={email} />
          <label class="block">
            <span class="mb-1.5 block text-sm font-medium">Code reçu</span>
            <input name="code" inputmode="numeric" maxlength="6" required
              class="{inputCls} text-center text-lg font-bold tracking-[0.4em]" placeholder="000000" />
          </label>
          <Button type="submit" class="w-full" size="lg">Vérifier</Button>
        </form>
      {/if}

      <p class="mt-6 text-center text-sm text-muted-foreground">
        Pas encore de compte ?
        <a href="/inscription{page.url.search}" class="font-medium text-link hover:underline">Créer un compte</a>
      </p>
    </div>
  </div>
</div>
