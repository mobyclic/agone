<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  let { data, form } = $props();
  const p = $derived(data.proforma);
  const eur = (n: number) => `${(n ?? 0).toFixed(2).replace('.', ',')} €`;
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  let envoi = $state(false);
</script>

<svelte:head><title>{p ? `Validation de la proforma ${p.ref}` : 'Lien inconnu'} · Agone</title><meta name="robots" content="noindex" /></svelte:head>

<div class="mx-auto max-w-xl px-4 py-12">
  {#if !p}
    <h1 class="display-title text-2xl">Lien inconnu</h1>
    <p class="mt-3 text-sm text-muted-foreground">Ce lien de validation ne correspond à aucune facture pro forma, ou n’est plus valable. Écrivez-nous si besoin.</p>
  {:else if form?.ok || p.validee}
    <h1 class="display-title text-2xl">Merci, c’est validé</h1>
    <p class="mt-3 text-sm">La facture définitive{(form?.ref ?? p.facture_ref) ? ` n° ${form?.ref ?? p.facture_ref}` : ''} a été émise{p.validee && !form?.ok ? ' lors d’une validation précédente' : ''} et vous est envoyée par e-mail.</p>
  {:else}
    <p class="eyebrow">Facture pro forma n° {p.ref} · {dateFr(p.issued_at)}</p>
    <h1 class="display-title mt-2 text-2xl">{p.name}</h1>
    <p class="mt-3 text-sm text-muted-foreground">Vérifiez le détail ci-dessous. En validant, vous acceptez cette facture ; la facture définitive vous sera envoyée aussitôt.</p>
    <table class="mt-6 w-full text-sm">
      <tbody class="divide-y divide-border">
        {#each p.lines as l, i (i)}
          <tr><td class="py-2 pr-3">{l.description}</td><td class="py-2 text-center text-muted-foreground">× {l.qty}</td><td class="py-2 text-right tabular-nums">{eur(l.total)}</td></tr>
        {/each}
      </tbody>
      <tfoot class="border-t-2 border-foreground">
        <tr><td colspan="2" class="pt-2 text-right text-muted-foreground">Total HT</td><td class="pt-2 text-right tabular-nums">{eur(p.subtotal_ht)}</td></tr>
        <tr><td colspan="2" class="text-right text-muted-foreground">TVA</td><td class="text-right tabular-nums">{eur(p.tax_total)}</td></tr>
        <tr class="font-bold"><td colspan="2" class="py-1 text-right">Total TTC</td><td class="py-1 text-right tabular-nums">{eur(p.total_ttc)}</td></tr>
      </tfoot>
    </table>
    {#if form?.error}<p class="mt-4 text-sm text-destructive">{form.error}</p>{/if}
    <form method="POST" action="?/valider" use:enhance={() => { envoi = true; return async ({ update }) => { await update(); envoi = false; }; }} class="mt-8">
      <Button type="submit" variant="brand" disabled={envoi}>{envoi ? 'Validation…' : 'Je valide cette facture'}</Button>
    </form>
  {/if}
</div>
