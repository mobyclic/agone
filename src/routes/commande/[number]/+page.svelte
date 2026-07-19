<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { CheckCircle, Clock, BookOpen, Receipt } from 'phosphor-svelte';
  import { trackPurchase, itemId } from '$lib/analytics';

  let { data } = $props();
  const o = $derived(data.order);
  const eur = (n: number) => `${(n ?? 0).toFixed(2).replace('.', ',')} €`;
  const FORMAT: Record<string, string> = { papier: 'Papier', epub: 'Numérique', souscription: 'Souscription' };
  const paid = $derived(o.status === 'paid' || o.status === 'completed' || o.status === 'processing');
  const STATUS: Record<string, string> = {
    pending: 'En attente de paiement', paid: 'Payée', processing: 'En préparation',
    sent_to_bl: 'Transmise au distributeur', completed: 'Terminée', cancelled: 'Annulée', refunded: 'Remboursée', failed: 'Échouée'
  };

  // Conversion e-commerce (dédupliquée par n° de commande) — pour Meta/Instagram Ads via GTM.
  onMount(() => {
    if (!paid) return;
    trackPurchase({
      transaction_id: String(o.number),
      value: o.total,
      shipping: o.shipping_total,
      coupon: o.promo_code || undefined,
      items: (o.lines ?? []).map((l: any) => ({ item_id: itemId(l.book_id), item_name: l.title, price: l.unit_price, quantity: l.qty, item_variant: FORMAT[l.format] ?? l.format }))
    });
  });
</script>

<svelte:head><title>Commande n°{o.number} · Agone</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 py-12 sm:px-6">
  <div class="text-center">
    {#if paid}
      <CheckCircle size={48} class="mx-auto text-success" weight="fill" />
      <h1 class="mt-3 text-2xl font-extrabold">Merci pour votre commande !</h1>
    {:else}
      <Clock size={48} class="mx-auto text-link" weight="fill" />
      <h1 class="mt-3 text-2xl font-extrabold">Commande enregistrée</h1>
      <p class="mt-1 text-sm text-muted-foreground">Elle est en attente de paiement. Nous vous recontacterons pour la finaliser.</p>
    {/if}
    <p class="mt-2 text-muted-foreground">Commande <span class="font-semibold text-foreground">n°{o.number}</span> · {STATUS[o.status] ?? o.status}</p>
  </div>

  <div class="mt-8 rounded-lg border border-border bg-card p-5">
    <ul class="divide-y divide-border">
      {#each o.lines as l (l.slug + l.format)}
        <li class="flex items-center justify-between gap-3 py-3 text-sm">
          <span><a href="/livre/{l.slug}" class="font-medium hover:text-link">{l.title}</a><span class="ml-2 text-xs text-muted-foreground">{FORMAT[l.format] ?? l.format} × {l.qty}</span></span>
          <span class="font-medium">{eur(l.line_total)}</span>
        </li>
      {/each}
    </ul>
    <div class="mt-3 space-y-1 border-t border-border pt-3 text-sm">
      <div class="flex justify-between text-muted-foreground"><span>Sous-total</span><span>{eur(o.subtotal)}</span></div>
      {#if o.discount_total > 0}<div class="flex justify-between text-success"><span>Remise{o.promo_code ? ` (${o.promo_code})` : ''}</span><span>−{eur(o.discount_total)}</span></div>{/if}
      {#if o.has_physical}<div class="flex justify-between text-muted-foreground"><span>Livraison</span><span>{o.shipping_total > 0 ? eur(o.shipping_total) : 'Offerte'}</span></div>{/if}
      <div class="flex justify-between pt-1 text-base font-bold"><span>Total</span><span>{eur(o.total)}</span></div>
    </div>
  </div>

  <div class="mt-6 flex flex-wrap justify-center gap-3">
    {#if paid && o.has_ebook}
      <Button href="/compte/bibliotheque" variant="brand"><BookOpen size={16} /> Ma bibliothèque</Button>
    {/if}
    <Button href="/compte/commandes" variant="outline"><Receipt size={16} /> Mes commandes</Button>
    <Button href="/catalogue" variant="ghost">Continuer mes achats</Button>
  </div>
</div>
