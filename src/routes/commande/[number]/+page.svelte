<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { CheckCircle, Clock, BookOpen, Receipt } from 'phosphor-svelte';

  let { data } = $props();
  const o = $derived(data.order);
  const eur = (n: number) => `${(n ?? 0).toFixed(2).replace('.', ',')} €`;
  const FORMAT: Record<string, string> = { papier: 'Papier', epub: 'Numérique', souscription: 'Souscription' };
  const paid = $derived(o.status === 'paid' || o.status === 'completed' || o.status === 'processing');
  const STATUS: Record<string, string> = {
    pending: 'En attente de paiement', paid: 'Payée', processing: 'En préparation',
    sent_to_bl: 'Transmise au distributeur', completed: 'Terminée', cancelled: 'Annulée', refunded: 'Remboursée', failed: 'Échouée'
  };
</script>

<svelte:head><title>Commande n°{o.number} · Agone</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 py-12 sm:px-6">
  <div class="text-center">
    {#if paid}
      <CheckCircle size={48} class="mx-auto text-success" weight="fill" />
      <h1 class="mt-3 text-2xl font-extrabold">Merci pour votre commande !</h1>
    {:else}
      <Clock size={48} class="mx-auto text-primary" weight="fill" />
      <h1 class="mt-3 text-2xl font-extrabold">Commande enregistrée</h1>
      <p class="mt-1 text-sm text-muted-foreground">Elle est en attente de paiement. Nous vous recontacterons pour la finaliser.</p>
    {/if}
    <p class="mt-2 text-muted-foreground">Commande <span class="font-semibold text-foreground">n°{o.number}</span> · {STATUS[o.status] ?? o.status}</p>
  </div>

  <div class="mt-8 rounded-lg border border-border bg-card p-5">
    <ul class="divide-y divide-border">
      {#each o.lines as l (l.slug + l.format)}
        <li class="flex items-center justify-between gap-3 py-3 text-sm">
          <span><a href="/livre/{l.slug}" class="font-medium hover:text-primary">{l.title}</a><span class="ml-2 text-xs text-muted-foreground">{FORMAT[l.format] ?? l.format} × {l.qty}</span></span>
          <span class="font-medium">{eur(l.line_total)}</span>
        </li>
      {/each}
    </ul>
    <div class="mt-3 flex justify-between border-t border-border pt-3 font-bold">
      <span>Total</span><span>{eur(o.total)}</span>
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
