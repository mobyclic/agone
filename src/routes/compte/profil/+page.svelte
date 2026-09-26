<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { Trash } from 'phosphor-svelte';
  let { data, form } = $props();
  const p = $derived(data.profile ?? {});
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const lbl = 'mb-1 block text-xs font-medium text-muted-foreground';

  // Livraison à la même adresse que la facturation, sauf si une autre est mémorisée.
  let memeAdresse = $state(untrack(() => !data.profile?.shipping));
  let confirmeSuppression = $state(false);
  let motSuppression = $state('');
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

  <!-- Adresses : préremplissent le paiement, modifiables à tout moment. -->
  <form method="POST" action="?/addresses" use:enhance class="rounded-lg border border-border bg-card p-5">
    <h3 class="eyebrow mb-1">Adresses</h3>
    <p class="mb-4 text-xs text-muted-foreground">Elles préremplissent votre prochaine commande ; vous pourrez toujours les changer au moment de payer.</p>
    {@render adresse('', p.billing ?? {}, 'Facturation')}
    <label class="mt-4 flex items-center gap-2 text-sm">
      <input type="checkbox" name="ship_same" bind:checked={memeAdresse} class="size-4 rounded border-border" /> Livrer à la même adresse
    </label>
    {#if !memeAdresse}
      <div class="mt-4 border-t border-border pt-4">{@render adresse('ship_', p.shipping ?? {}, 'Livraison')}</div>
    {/if}
    <Button type="submit" variant="outline" class="mt-4">Enregistrer les adresses</Button>
  </form>

  <form method="POST" action="?/password" use:enhance class="rounded-lg border border-border bg-card p-5">
    <h3 class="eyebrow mb-4">Mot de passe</h3>
    {#if form?.pwerror}<p class="mb-3 rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.pwerror}</p>{/if}
    <label class={lbl}>Nouveau mot de passe <input name="password" type="password" minlength="8" class={input} autocomplete="new-password" /></label>
    <Button type="submit" variant="outline" class="mt-4">Changer le mot de passe</Button>
  </form>

  <!-- Suppression : irréversible ; les commandes restent, anonymisées. -->
  <div class="rounded-lg border border-border p-5">
    <h3 class="eyebrow mb-1">Supprimer mon compte</h3>
    <p class="mb-3 text-xs text-muted-foreground">
      Vos données personnelles sont effacées et votre accès fermé. Vos commandes et factures sont conservées le temps
      qu’impose la comptabilité, sans votre nom ni votre adresse. Les livres numériques achetés ne seront plus accessibles.
    </p>
    <Button type="button" variant="ghost" size="sm" class="text-destructive hover:bg-destructive/10" onclick={() => { motSuppression = ''; confirmeSuppression = true; }}>
      <Trash size={15} /> Supprimer mon compte
    </Button>
  </div>
</div>

{#snippet adresse(prefixe: string, a: any, titre: string)}
  <p class="mb-2 text-sm font-medium">{titre}</p>
  <div class="grid gap-3 sm:grid-cols-2">
    <label class={lbl}>Prénom <input name="{prefixe}first_name" value={a.first_name ?? p.first_name ?? ''} class={input} /></label>
    <label class={lbl}>Nom <input name="{prefixe}last_name" value={a.last_name ?? p.last_name ?? ''} class={input} /></label>
    <label class="{lbl} sm:col-span-2">Adresse <input name="{prefixe}address_1" value={a.address_1 ?? ''} class={input} autocomplete="address-line1" /></label>
    <label class="{lbl} sm:col-span-2">Complément <input name="{prefixe}address_2" value={a.address_2 ?? ''} class={input} autocomplete="address-line2" /></label>
    <label class={lbl}>Code postal <input name="{prefixe}postcode" value={a.postcode ?? ''} class={input} autocomplete="postal-code" /></label>
    <label class={lbl}>Ville <input name="{prefixe}city" value={a.city ?? ''} class={input} autocomplete="address-level2" /></label>
    <label class={lbl}>Pays
      <select name="{prefixe}country" class={input}>
        {#each data.countries as c (c.code)}<option value={c.code} selected={(a.country ?? 'FR') === c.code}>{c.name}</option>{/each}
      </select>
    </label>
    <label class={lbl}>Téléphone <input name="{prefixe}phone" value={a.phone ?? ''} class={input} autocomplete="tel" /></label>
  </div>
{/snippet}

{#if confirmeSuppression}
  <div class="fixed inset-0 z-[80] grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="titre-suppression">
    <button type="button" class="absolute inset-0 cursor-default bg-black/60" aria-label="Annuler" onclick={() => (confirmeSuppression = false)}></button>
    <form method="POST" action="?/delete" use:enhance class="relative z-10 w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-2xl">
      <h3 id="titre-suppression" class="text-lg font-bold">Supprimer votre compte ?</h3>
      <p class="mt-2 text-sm text-muted-foreground">Cette action est définitive. Vous serez déconnecté·e immédiatement.</p>
      {#if form?.delerror}<p class="mt-3 rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.delerror}</p>{/if}
      <label class="mt-4 block text-sm font-medium">
        Tapez <span class="font-mono font-bold">SUPPRIMER</span> pour confirmer
        <!-- svelte-ignore a11y_autofocus -->
        <input name="confirmation" bind:value={motSuppression} autofocus autocomplete="off" spellcheck="false"
          class="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 font-mono text-sm outline-none focus:border-destructive" />
      </label>
      <div class="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onclick={() => (confirmeSuppression = false)}>Annuler</Button>
        <Button type="submit" size="sm" disabled={motSuppression.trim().toUpperCase() !== 'SUPPRIMER'} class="bg-destructive text-white hover:bg-destructive/90 disabled:opacity-40">
          <Trash size={15} /> Supprimer définitivement
        </Button>
      </div>
    </form>
  </div>
{/if}
