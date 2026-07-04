<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { Trash, ArrowRight, BookOpen } from 'phosphor-svelte';

  let { data } = $props();
  const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
  const FORMAT: Record<string, string> = { papier: 'Papier', epub: 'Numérique (ePub)', souscription: 'Souscription' };
</script>

<svelte:head><title>Mon panier · Agone</title></svelte:head>

<div class="mx-auto max-w-4xl px-4 py-10 sm:px-6">
  <h1 class="text-2xl font-extrabold tracking-tight">Mon panier</h1>

  {#if data.cart.lines.length === 0}
    <div class="mt-8 rounded-lg border border-border bg-card p-10 text-center">
      <p class="text-muted-foreground">Votre panier est vide.</p>
      <Button href="/catalogue" variant="brand" class="mt-4"><BookOpen size={16} /> Parcourir le catalogue</Button>
    </div>
  {:else}
    <div class="mt-6 space-y-3">
      {#each data.cart.lines as l (l.id + l.format)}
        <div class="flex items-center gap-4 rounded-lg border border-border bg-card p-3">
          <a href="/livre/{l.slug}" class="h-20 w-14 shrink-0 overflow-hidden rounded border border-border bg-muted">
            {#if l.cover_url}<img src={l.cover_url} alt="" class="size-full object-cover" />{/if}
          </a>
          <div class="min-w-0 flex-1">
            <a href="/livre/{l.slug}" class="font-medium hover:text-primary">{l.title}</a>
            <p class="text-xs text-muted-foreground">{FORMAT[l.format] ?? l.format} · {eur(l.unit_price)}</p>
          </div>
          <form method="POST" action="?/update" use:enhance class="flex items-center gap-1">
            <input type="hidden" name="id" value={l.id} />
            <input type="hidden" name="format" value={l.format} />
            <input name="qty" type="number" min="0" max="99" value={l.qty} onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()} class="h-9 w-16 rounded-md border border-border bg-background px-2 text-sm" />
          </form>
          <div class="w-20 text-right text-sm font-semibold">{eur(l.line_total)}</div>
          <form method="POST" action="?/remove" use:enhance>
            <input type="hidden" name="id" value={l.id} />
            <input type="hidden" name="format" value={l.format} />
            <button type="submit" class="text-muted-foreground hover:text-destructive" aria-label="Retirer"><Trash size={16} /></button>
          </form>
        </div>
      {/each}
    </div>

    <div class="mt-6 flex flex-col items-end gap-3 border-t border-border pt-6">
      <div class="flex w-full max-w-xs justify-between text-sm">
        <span class="text-muted-foreground">Sous-total</span><span class="font-semibold">{eur(data.cart.subtotal)}</span>
      </div>
      {#if data.cart.has_physical}
        <div class="flex w-full max-w-xs justify-between text-sm"><span class="text-muted-foreground">Livraison (France)</span><span>Offerte</span></div>
      {/if}
      <div class="flex w-full max-w-xs justify-between text-base font-bold">
        <span>Total</span><span>{eur(data.cart.subtotal)}</span>
      </div>
      <div class="flex gap-2">
        <form method="POST" action="?/clear" use:enhance><button type="submit" class="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">Vider</button></form>
        <Button href="/checkout" variant="brand" size="lg">Passer commande <ArrowRight size={18} /></Button>
      </div>
    </div>
  {/if}
</div>
