<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, Lock } from 'phosphor-svelte';

  let { data, form } = $props();
  const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
  const b = $derived(form?.values ?? data.user?.billing ?? {});
  const FORMAT: Record<string, string> = { papier: 'Papier', epub: 'Numérique', souscription: 'Souscription' };
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const lbl = 'mb-1 block text-xs font-medium text-muted-foreground';
</script>

<svelte:head><title>Commande · Agone</title></svelte:head>

<div class="mx-auto max-w-4xl px-4 py-10 sm:px-6">
  <a href="/panier" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Panier</a>
  <h1 class="text-2xl font-extrabold tracking-tight">Finaliser la commande</h1>

  {#if form?.error}<p class="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}

  <div class="mt-6 grid gap-8 lg:grid-cols-[1fr_320px]">
    <form method="POST" use:enhance class="space-y-5">
      <div class="rounded-lg border border-border bg-card p-5">
        <h2 class="eyebrow mb-4">Coordonnées{data.cart.has_physical ? ' & livraison' : ''}</h2>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class={lbl}>Prénom * <input name="first_name" required value={b.first_name ?? data.user?.first_name ?? ''} class={input} /></label>
          <label class={lbl}>Nom * <input name="last_name" required value={b.last_name ?? data.user?.last_name ?? ''} class={input} /></label>
          <label class="{lbl} sm:col-span-2">Email * <input name="email" type="email" required value={b.email ?? data.user?.email ?? ''} class={input} /></label>
          <label class="{lbl} sm:col-span-2">Téléphone <input name="phone" value={b.phone ?? ''} class={input} /></label>
          {#if data.cart.has_physical}
            <label class="{lbl} sm:col-span-2">Adresse * <input name="address_1" required value={b.address_1 ?? ''} class={input} /></label>
            <label class="{lbl} sm:col-span-2">Complément <input name="address_2" value={b.address_2 ?? ''} class={input} /></label>
            <label class={lbl}>Code postal * <input name="postcode" required value={b.postcode ?? ''} class={input} /></label>
            <label class={lbl}>Ville * <input name="city" required value={b.city ?? ''} class={input} /></label>
            <label class="{lbl} sm:col-span-2">Pays <input name="country" value={b.country ?? 'FR'} class={input} /></label>
          {/if}
        </div>
      </div>

      <Button type="submit" variant="brand" size="lg" class="w-full">
        <Lock size={16} /> {data.stripeEnabled ? 'Payer' : 'Valider la commande'} — {eur(data.cart.subtotal)}
      </Button>
      {#if !data.stripeEnabled}
        <p class="text-center text-xs text-muted-foreground">Le paiement en ligne sera activé prochainement — votre commande sera enregistrée.</p>
      {/if}
    </form>

    <!-- Récapitulatif -->
    <aside class="h-fit rounded-lg border border-border bg-card p-5">
      <h2 class="eyebrow mb-3">Votre commande</h2>
      <ul class="space-y-2 text-sm">
        {#each data.cart.lines as l (l.id + l.format)}
          <li class="flex justify-between gap-2">
            <span class="min-w-0"><span class="line-clamp-1">{l.title}</span><span class="text-xs text-muted-foreground">{FORMAT[l.format] ?? l.format} × {l.qty}</span></span>
            <span class="shrink-0 font-medium">{eur(l.line_total)}</span>
          </li>
        {/each}
      </ul>
      <div class="mt-4 space-y-1 border-t border-border pt-3 text-sm">
        <div class="flex justify-between text-muted-foreground"><span>Sous-total</span><span>{eur(data.cart.subtotal)}</span></div>
        {#if data.cart.has_physical}<div class="flex justify-between text-muted-foreground"><span>Livraison</span><span>Offerte</span></div>{/if}
        <div class="flex justify-between text-base font-bold"><span>Total</span><span>{eur(data.cart.subtotal)}</span></div>
      </div>
    </aside>
  </div>
</div>
