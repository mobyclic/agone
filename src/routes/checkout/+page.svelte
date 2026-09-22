<script lang="ts">
  import { colonneCollante } from '$lib/client/sticky';
  import { untrack, onMount } from 'svelte';
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import PageHead from '$lib/components/PageHead.svelte';
  import { quoteShippingFor } from '$lib/shipping-calc';
  import { trackBeginCheckout, itemId } from '$lib/analytics';
  import { ArrowLeft, Lock } from 'phosphor-svelte';

  let { data, form } = $props();
  const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
  const discount = $derived(data.promo && data.promo.ok ? data.promo.discount : 0);
  const b = $derived<any>(form?.values ?? data.user?.billing ?? {});
  const sv = $derived<any>((form?.values as any)?.ship ?? data.user?.shipping ?? {});
  // Facturation et livraison séparables ; le devis suit le pays de LIVRAISON
  // effectif (recalculé côté serveur à la validation).
  let country = $state(untrack(() => (form?.values as any)?.country ?? data.user?.billing?.country ?? 'FR'));
  let separee = $state(untrack(() => !!(form?.values as any)?.ship_different));
  let shipCountry = $state(untrack(() => (form?.values as any)?.ship?.country ?? data.user?.shipping?.country ?? 'FR'));
  const shipCountries = $derived(data.shipCountries.length ? data.shipCountries : [{ code: 'FR', name: 'France' }]);
  const paysLivraison = $derived(separee ? shipCountry : country);
  const shipQuote = $derived(quoteShippingFor(data.shipZones, paysLivraison, data.cart.total_weight, data.cart.subtotal));
  const shipping = $derived(data.cart.has_physical && shipQuote.ok ? shipQuote.price : 0);
  const total = $derived(Math.max(0, data.cart.subtotal - discount) + shipping);

  onMount(() => {
    trackBeginCheckout(
      data.cart.lines.map((l) => ({ item_id: itemId(l.id), item_name: l.title, price: l.unit_price, quantity: l.qty, item_variant: FORMAT[l.format] ?? l.format })),
      { value: Math.max(0, data.cart.subtotal - discount), coupon: data.promo && data.promo.ok ? data.promo.code : undefined }
    );
  });
  const FORMAT: Record<string, string> = { papier: 'Papier', epub: 'Numérique', souscription: 'Souscription' };
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const lbl = 'mb-1 block text-xs font-medium text-muted-foreground';
</script>

<svelte:head><title>Commande · Agone</title></svelte:head>

<PageHead eyebrow="Boutique" title="Finaliser la commande" width="mx-auto max-w-6xl" />

<div class="mx-auto max-w-6xl py-10" style="padding-inline: var(--page-gutter)">
  <a href="/panier" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Panier</a>

  {#if form?.error}<p class="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}

  <div class="mt-6 grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
    <form method="POST" use:enhance class="space-y-5">
      <div class="rounded-lg border border-border bg-card p-5">
        <h2 class="eyebrow mb-4">{data.cart.has_physical ? 'Facturation' : 'Coordonnées'}</h2>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class={lbl}>Prénom * <input name="first_name" required autocomplete="billing given-name" value={b.first_name ?? data.user?.first_name ?? ''} class={input} /></label>
          <label class={lbl}>Nom * <input name="last_name" required autocomplete="billing family-name" value={b.last_name ?? data.user?.last_name ?? ''} class={input} /></label>
          <label class="{lbl} sm:col-span-2">Email * <input name="email" type="email" required autocomplete="email" value={b.email ?? data.user?.email ?? ''} class={input} /></label>
          <label class="{lbl} sm:col-span-2">Téléphone <input name="phone" autocomplete="billing tel" value={b.phone ?? ''} class={input} /></label>
          <label class="{lbl} sm:col-span-2">Adresse{data.cart.has_physical ? ' *' : ''} <input name="address_1" required={data.cart.has_physical} autocomplete="billing address-line1" value={b.address_1 ?? ''} class={input} /></label>
          <label class="{lbl} sm:col-span-2">Complément <input name="address_2" autocomplete="billing address-line2" value={b.address_2 ?? ''} class={input} /></label>
          <label class={lbl}>Code postal{data.cart.has_physical ? ' *' : ''} <input name="postcode" required={data.cart.has_physical} autocomplete="billing postal-code" value={b.postcode ?? ''} class={input} /></label>
          <label class={lbl}>Ville{data.cart.has_physical ? ' *' : ''} <input name="city" required={data.cart.has_physical} autocomplete="billing address-level2" value={b.city ?? ''} class={input} /></label>
          <label class="{lbl} sm:col-span-2">Pays{data.cart.has_physical ? ' *' : ''}
            <!-- Facturation : tout pays. Sans adresse de livraison distincte, il doit
                 aussi être livrable (vérifié par le devis ci-contre). -->
            <select name="country" bind:value={country} autocomplete="billing country" class={input}>
              {#each (data.cart.has_physical && !separee ? shipCountries : data.countries) as c (c.code)}<option value={c.code}>{c.name}</option>{/each}
            </select>
          </label>
        </div>

        {#if data.cart.has_physical}
          <label class="mt-5 flex items-center gap-2.5 border-t border-border pt-4 text-sm font-medium">
            <input type="checkbox" name="ship_different" bind:checked={separee} class="size-4 rounded border-border" />
            Livrer à une autre adresse
          </label>
        {/if}
      </div>

      {#if data.cart.has_physical && separee}
        <div class="rounded-lg border border-border bg-card p-5">
          <h2 class="eyebrow mb-4">Livraison</h2>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class={lbl}>Prénom * <input name="ship_first_name" required autocomplete="shipping given-name" value={sv.first_name ?? ''} class={input} /></label>
            <label class={lbl}>Nom * <input name="ship_last_name" required autocomplete="shipping family-name" value={sv.last_name ?? ''} class={input} /></label>
            <label class="{lbl} sm:col-span-2">Téléphone (pour le transporteur) <input name="ship_phone" autocomplete="shipping tel" value={sv.phone ?? ''} class={input} /></label>
            <label class="{lbl} sm:col-span-2">Adresse * <input name="ship_address_1" required autocomplete="shipping address-line1" value={sv.address_1 ?? ''} class={input} /></label>
            <label class="{lbl} sm:col-span-2">Complément <input name="ship_address_2" autocomplete="shipping address-line2" value={sv.address_2 ?? ''} class={input} /></label>
            <label class={lbl}>Code postal * <input name="ship_postcode" required autocomplete="shipping postal-code" value={sv.postcode ?? ''} class={input} /></label>
            <label class={lbl}>Ville * <input name="ship_city" required autocomplete="shipping address-level2" value={sv.city ?? ''} class={input} /></label>
            <label class="{lbl} sm:col-span-2">Pays de livraison *
              <select name="ship_country" bind:value={shipCountry} autocomplete="shipping country" class={input}>
                {#each shipCountries as c (c.code)}<option value={c.code}>{c.name}</option>{/each}
              </select>
            </label>
          </div>
        </div>
      {/if}

      <Button type="submit" variant="brand" size="lg" class="w-full">
        <Lock size={16} /> {data.stripeEnabled ? 'Payer' : 'Valider la commande'} — {eur(total)}
      </Button>
      {#if !data.stripeEnabled}
        <p class="text-center text-xs text-muted-foreground">Le paiement en ligne sera activé prochainement — votre commande sera enregistrée.</p>
      {/if}
    </form>

    <!-- Récapitulatif -->
    <aside use:colonneCollante class="h-fit rounded-lg border border-border bg-card p-5">
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
        {#if data.promo && data.promo.ok}<div class="flex justify-between text-success"><span>Code {data.promo.code}</span><span>−{eur(data.promo.discount)}</span></div>{/if}
        {#if data.cart.has_physical}
          <div class="flex justify-between text-muted-foreground"><span>Livraison</span><span>{shipQuote.ok ? (shipping > 0 ? eur(shipping) : 'Offerte') : '—'}</span></div>
          {#if !shipQuote.ok}<p class="text-xs text-destructive">{shipQuote.error}</p>{/if}
        {/if}
        <div class="flex justify-between text-base font-bold"><span>Total</span><span>{eur(total)}</span></div>
      </div>
    </aside>
  </div>
</div>
