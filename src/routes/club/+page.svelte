<script lang="ts">
  /** Le club des lecteurs : présentation, avantages, adhésion en ligne. */
  import { enhance } from '$app/forms';
  import PageHead from '$lib/components/PageHead.svelte';
  import { euros } from '$lib/labels';
  let { data, form } = $props();
  const c = $derived(data.club);
  const dateFr = (s: string) => new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
</script>

<svelte:head><title>{c.nom} · Agone</title><meta name="description" content={c.texte} /></svelte:head>

<PageHead eyebrow="Agone" title={c.nom} width="mx-auto max-w-4xl" />

<div class="mx-auto max-w-4xl py-10" style="padding-inline: var(--page-gutter)">
  <div class="grid gap-10 md:grid-cols-[minmax(0,1fr)_18rem] md:items-start">
    <div>
      {#if c.texte}<p class="text-lg leading-relaxed">{c.texte}</p>{/if}
      <ul class="mt-6 space-y-3 border-t-2 border-foreground pt-5">
        <li class="flex gap-3"><span class="font-display text-2xl font-bold text-link">−{c.remise} %</span><span class="pt-1">sur tout le fonds : les ouvrages parus depuis plus de {c.fond_ans} an{c.fond_ans > 1 ? 's' : ''}, en papier comme en numérique, toute l'année.</span></li>
        {#if c.franco !== 'non'}<li class="flex gap-3"><span class="font-display text-2xl font-bold text-link">0 €</span><span class="pt-1">de frais de port{c.franco === 'nouveautes' ? ' sur les commandes qui comprennent une nouveauté' : ''}.</span></li>{/if}
        <li class="text-sm text-muted-foreground">La remise s'applique d'elle-même au panier une fois connecté·e avec le compte de l'adhésion.</li>
      </ul>
    </div>
    <aside class="border border-border bg-card p-5">
      <div class="font-display text-3xl font-bold">{euros(c.prix_ttc)}</div>
      <div class="text-sm text-muted-foreground">TTC pour {c.duree_mois} mois</div>
      {#if data.merci}
        <p class="mt-4 bg-success/10 px-3 py-2 text-sm text-success">Merci ! Votre adhésion est enregistrée dès la confirmation du paiement.</p>
      {/if}
      {#if data.adhesion}
        <p class="mt-4 text-sm">Vous êtes membre jusqu'au <strong>{dateFr(data.adhesion.ends_at)}</strong>.</p>
        <form method="POST" action="?/adherer" use:enhance class="mt-3"><button type="submit" class="w-full border-2 border-foreground px-4 py-2.5 font-display text-sm font-bold uppercase tracking-wide hover:bg-foreground hover:text-background">Renouveler d'un an</button></form>
      {:else}
        <form method="POST" action="?/adherer" use:enhance class="mt-4"><button type="submit" class="btn-brand w-full px-4 py-3 font-display text-sm font-bold uppercase tracking-wide">{data.connecte ? 'Adhérer' : 'Se connecter pour adhérer'}</button></form>
      {/if}
      {#if form?.error}<p class="mt-3 text-sm text-destructive">{form.error}</p>{/if}
    </aside>
  </div>
</div>
