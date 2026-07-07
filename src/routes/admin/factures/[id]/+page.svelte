<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, Download, Printer, Receipt } from 'phosphor-svelte';
  import { euros } from '$lib/labels';

  let { data } = $props();
  const f = $derived(data.invoice);
  const isCredit = $derived(f.kind === 'credit_note');
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—');
  const eur = (n?: number) => euros(n) ?? '—';
  const sign = $derived(isCredit ? '−' : '');

  let frame = $state<HTMLIFrameElement | null>(null);
  function printPdf() {
    try {
      frame?.contentWindow?.focus();
      frame?.contentWindow?.print();
    } catch {
      window.open(`/admin/factures/${f.id}/pdf`, '_blank');
    }
  }
</script>

<svelte:head><title>{f.ref} · Facturation · Admin</title></svelte:head>

<a href="/admin/factures" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
  <ArrowLeft size={16} /> Facturation
</a>

<div class="mb-5 flex flex-wrap items-start justify-between gap-3">
  <div>
    <div class="flex items-center gap-2">
      <h2 class="text-xl font-bold">{isCredit ? 'Avoir' : 'Facture'} n° {f.ref}</h2>
      {#if isCredit}<span class="rounded bg-warning/15 px-2 py-0.5 text-xs text-warning">Avoir</span>{/if}
    </div>
    <p class="text-sm text-muted-foreground">
      Émis le {dateFr(f.issued_at)}
      {#if f.order_number}· <a href="/admin/commandes/{f.order_number}" class="text-link hover:underline">Commande #{f.order_number}</a>{/if}
    </p>
  </div>
  <div class="flex gap-2">
    <Button type="button" onclick={printPdf} variant="outline"><Printer size={16} /> Imprimer</Button>
    <Button href="/admin/factures/{f.id}/pdf?dl=1" variant="brand"><Download size={16} /> Télécharger</Button>
  </div>
</div>

<!-- Aperçu PDF embarqué -->
<div class="mb-6 overflow-hidden rounded-lg border border-border bg-muted/30">
  <iframe bind:this={frame} src="/admin/factures/{f.id}/pdf#toolbar=0" title="Aperçu {f.ref}" class="h-[78vh] max-h-[900px] w-full bg-white"></iframe>
</div>

<div class="grid gap-5 lg:grid-cols-[1fr_260px]">
  <div class="space-y-5">
    <!-- Lignes -->
    <div class="overflow-x-auto rounded-lg border border-border bg-card">
      <table class="w-full text-sm">
        <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr><th class="px-3 py-2 font-medium">Désignation</th><th class="px-3 py-2 text-center font-medium">Qté</th><th class="px-3 py-2 text-right font-medium">P.U. TTC</th><th class="px-3 py-2 text-center font-medium">TVA</th><th class="px-3 py-2 text-right font-medium">Total TTC</th></tr>
        </thead>
        <tbody class="divide-y divide-border">
          {#each f.lines ?? [] as l (l.description + l.unit_price_ttc)}
            <tr>
              <td class="px-3 py-2">{l.description}</td>
              <td class="px-3 py-2 text-center">{l.qty}</td>
              <td class="px-3 py-2 text-right tabular-nums">{eur(l.unit_price_ttc)}</td>
              <td class="px-3 py-2 text-center text-muted-foreground">{String(l.vat_rate ?? f.vat_rate).replace('.', ',')} %</td>
              <td class="px-3 py-2 text-right tabular-nums">{eur(l.line_total_ttc)}</td>
            </tr>
          {/each}
        </tbody>
        <tfoot class="border-t border-border">
          <tr><td colspan="4" class="px-3 py-1.5 text-right text-muted-foreground">Total HT</td><td class="px-3 py-1.5 text-right tabular-nums">{sign}{eur(f.subtotal_ht)}</td></tr>
          {#each f.vat_breakdown ?? [] as b (b.rate)}
            <tr><td colspan="4" class="px-3 py-1.5 text-right text-muted-foreground">TVA {String(b.rate).replace('.', ',')} %</td><td class="px-3 py-1.5 text-right tabular-nums">{sign}{eur(b.tax)}</td></tr>
          {/each}
          <tr class="font-bold"><td colspan="4" class="px-3 py-2 text-right">Total TTC</td><td class="px-3 py-2 text-right tabular-nums">{sign}{eur(f.total_ttc)}</td></tr>
        </tfoot>
      </table>
    </div>

    {#if f.notes}<p class="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{f.notes}</p>{/if}

    {#if !isCredit}
      <form method="POST" action="?/credit_note" use:enhance>
        <Button type="submit" variant="outline" onclick={(e: Event) => { if (!confirm('Créer un avoir reprenant cette facture ?')) e.preventDefault(); }}>
          <Receipt size={15} /> Créer un avoir
        </Button>
      </form>
    {/if}
  </div>

  <!-- Client -->
  <div class="rounded-lg border border-border bg-card p-4">
    <h3 class="eyebrow mb-2">Facturé à</h3>
    <p class="text-sm font-medium">{f.bill_to?.name ?? 'Client'}</p>
    <div class="mt-1 space-y-0.5 text-sm text-muted-foreground">
      {#if f.bill_to?.address_1}<div>{f.bill_to.address_1}</div>{/if}
      {#if f.bill_to?.postcode || f.bill_to?.city}<div>{[f.bill_to?.postcode, f.bill_to?.city].filter(Boolean).join(' ')}</div>{/if}
      {#if f.bill_to?.country}<div>{f.bill_to.country}</div>{/if}
      {#if f.bill_to?.email}<div>{f.bill_to.email}</div>{/if}
    </div>
  </div>
</div>
