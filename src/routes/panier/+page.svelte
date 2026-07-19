<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import PageHead from '$lib/components/PageHead.svelte';
  import { Trash, ArrowRight, BookOpen, Minus, Plus } from 'phosphor-svelte';

  let { data } = $props();
  const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
  const FORMAT: Record<string, string> = { papier: 'Papier', epub: 'Numérique (ePub)', souscription: 'Souscription' };
  const discount = $derived(data.promo && data.promo.ok ? data.promo.discount : 0);
  const total = $derived(Math.max(0, data.cart.subtotal - discount));
</script>

<svelte:head><title>Mon panier · Agone</title></svelte:head>

<PageHead eyebrow="Boutique" title="Mon panier" width="max-w-5xl" />

<div class="mx-auto max-w-5xl px-4 py-10 sm:px-6">
  {#if data.cart.lines.length === 0}
    <div class="mt-8 rounded-lg border border-border bg-card p-10 text-center">
      <p class="text-muted-foreground">Votre panier est vide.</p>
      <Button href="/catalogue" variant="brand" class="mt-4"><BookOpen size={16} /> Parcourir le catalogue</Button>
    </div>
  {:else}
    <div class="mt-6 grid gap-8 lg:grid-cols-[1fr_320px] lg:items-start">
      <!-- Lignes -->
      <div class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {#each data.cart.lines as l (l.id + l.format)}
        <div class="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
          <a href="/livre/{l.slug}" class="h-24 w-16 shrink-0 overflow-hidden rounded border border-border bg-muted">
            {#if l.cover_url}<img src={l.cover_url} alt="" class="size-full object-cover" />{/if}
          </a>
          <div class="min-w-0 flex-1">
            <a href="/livre/{l.slug}" class="font-display font-semibold leading-snug hover:text-link">{l.title}</a>
            {#if l.author}<p class="text-sm text-link">{l.author}</p>{/if}
            <p class="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{FORMAT[l.format] ?? l.format} · {eur(l.unit_price)}</p>
          </div>

          <!-- Quantité : − / + -->
          <div class="flex items-center overflow-hidden rounded-md border border-border">
            <form method="POST" action="?/update" use:enhance>
              <input type="hidden" name="id" value={l.id} /><input type="hidden" name="format" value={l.format} /><input type="hidden" name="qty" value={l.qty - 1} />
              <button type="submit" disabled={l.qty <= 1} class="grid size-9 place-items-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30" aria-label="Diminuer la quantité"><Minus size={14} weight="bold" /></button>
            </form>
            <span class="w-9 text-center text-sm font-medium tabular-nums">{l.qty}</span>
            <form method="POST" action="?/update" use:enhance>
              <input type="hidden" name="id" value={l.id} /><input type="hidden" name="format" value={l.format} /><input type="hidden" name="qty" value={l.qty + 1} />
              <button type="submit" disabled={l.qty >= 99} class="grid size-9 place-items-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30" aria-label="Augmenter la quantité"><Plus size={14} weight="bold" /></button>
            </form>
          </div>

          <div class="w-20 text-right font-display font-semibold tabular-nums">{eur(l.line_total)}</div>
          <form method="POST" action="?/remove" use:enhance>
            <input type="hidden" name="id" value={l.id} /><input type="hidden" name="format" value={l.format} />
            <button type="submit" class="grid size-9 place-items-center text-muted-foreground hover:text-destructive" aria-label="Retirer l'article"><Trash size={16} /></button>
          </form>
        </div>
      {/each}
    </div>

      <!-- Récapitulatif — colonne latérale collante -->
      <aside class="lg:sticky lg:top-28">
        <div class="rounded-lg border border-border bg-card p-5">
          <h2 class="eyebrow mb-3">Récapitulatif</h2>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between"><span class="text-muted-foreground">Sous-total</span><span class="font-semibold tabular-nums">{eur(data.cart.subtotal)}</span></div>
            {#if data.promo && data.promo.ok}
              <div class="flex justify-between text-success"><span>Code {data.promo.code}</span><span class="tabular-nums">−{eur(data.promo.discount)}</span></div>
            {/if}
            {#if data.cart.has_physical}
              <div class="flex justify-between"><span class="text-muted-foreground">Livraison</span><span class="text-muted-foreground">calculée au paiement</span></div>
            {/if}
          </div>
          <div class="mt-3 flex items-baseline justify-between border-t border-border pt-3 text-base font-bold">
            <span>Total</span><span class="tabular-nums">{eur(total)}</span>
          </div>

          <!-- Code promo -->
          {#if data.promo && data.promo.ok}
            <div class="mt-3 flex items-center justify-between rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm">
              <span class="font-medium text-success">✓ {data.promo.code}</span>
              <form method="POST" action="?/removePromo" use:enhance><button type="submit" class="text-xs text-muted-foreground hover:text-destructive">Retirer</button></form>
            </div>
          {:else}
            <form method="POST" action="?/applyPromo" use:enhance class="mt-3 flex gap-2">
              <input name="code" placeholder="Code promo" autocomplete="off" class="h-9 w-full min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm uppercase outline-none focus:border-primary" />
              <button type="submit" class="shrink-0 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted">Appliquer</button>
            </form>
            {#if data.promoCode && data.promo && !data.promo.ok}
              <p class="mt-1.5 text-xs text-destructive">Code « {data.promoCode} » : {data.promo.error}</p>
            {/if}
          {/if}

          <Button href="/checkout" variant="brand" size="lg" class="mt-4 w-full justify-center">Passer commande <ArrowRight size={18} /></Button>
          <form method="POST" action="?/clear" use:enhance class="mt-2">
            <button type="submit" class="w-full rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">Vider le panier</button>
          </form>
        </div>
      </aside>
    </div>
  {/if}
</div>
