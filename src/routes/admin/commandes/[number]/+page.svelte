<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, Check } from 'phosphor-svelte';
  import { ORDER_STATUS_LABEL, CHANNEL_LABEL, euros } from '$lib/labels';

  let { data, form } = $props();
  const o = $derived(data.order);
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }) : '—');
  const fmtFormat = (f: string) => (f === 'epub' ? 'Numérique (ePub)' : f === 'souscription' ? 'Souscription' : f === 'papier' ? 'Papier' : f);

  const statusTone: Record<string, string> = {
    pending: 'bg-warning/15 text-warning', paid: 'bg-success/15 text-success',
    processing: 'bg-accent text-accent-foreground', sent_to_bl: 'bg-accent text-accent-foreground',
    completed: 'bg-success/15 text-success', cancelled: 'bg-muted text-muted-foreground',
    refunded: 'bg-muted text-muted-foreground', failed: 'bg-destructive/10 text-destructive'
  };

  function addressLines(a?: Record<string, unknown>): string[] {
    if (!a) return [];
    const g = (k: string) => (a[k] != null && a[k] !== '' ? String(a[k]) : '');
    return [
      [g('first_name'), g('last_name')].filter(Boolean).join(' ') || g('name') || g('full_name'),
      g('company'),
      g('address') || g('line1') || g('address1'),
      g('address2') || g('line2'),
      [g('postal_code') || g('zip'), g('city')].filter(Boolean).join(' '),
      g('country'), g('email'), g('phone')
    ].filter(Boolean);
  }
  const billing = $derived(addressLines(o.billing));
  const shipping = $derived(addressLines(o.shipping));
</script>

<svelte:head><title>Commande #{o.number} · Admin Agone</title></svelte:head>

<a href="/admin/commandes" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
  <ArrowLeft size={16} /> Commandes
</a>

<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">Commande #{o.number}</h2>
    <p class="text-sm text-muted-foreground">Passée le {dateFr(o.created_at)}{#if data.invoiceId} · <a href="/admin/factures/{data.invoiceId}" class="text-link hover:underline">Facture</a>{/if}</p>
  </div>
  <div class="flex flex-wrap items-center gap-2">
    {#if data.invoiceId}
      <a href="/admin/factures/{data.invoiceId}" class="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm hover:bg-muted">Voir la facture</a>
    {:else if ['paid', 'processing', 'sent_to_bl', 'completed'].includes(o.status)}
      <form method="POST" action="?/generate_invoice" use:enhance><button type="submit" class="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm hover:bg-muted">Générer la facture</button></form>
    {/if}
    {#if o.channel === 'sortie_editeur'}
      <a href="/admin/commandes/{o.number}/livraison?dl=1" class="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm hover:bg-muted">Bon de livraison</a>
    {/if}
    {#if o.channel && o.channel !== 'web'}<span class="rounded border border-border px-2.5 py-1 text-sm font-medium text-muted-foreground">{CHANNEL_LABEL[o.channel] ?? o.channel}</span>{/if}
    <span class="rounded px-2.5 py-1 text-sm font-medium {statusTone[o.status] ?? 'bg-secondary'}">{ORDER_STATUS_LABEL[o.status] ?? o.status}</span>
  </div>
</div>

<div class="grid gap-6 lg:grid-cols-[1fr_320px]">
  <!-- Lignes + totaux -->
  <div class="space-y-6">
    <div class="overflow-x-auto rounded-lg border border-border bg-card">
      <table class="w-full text-sm">
        <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">Article</th>
            <th class="px-3 py-2 font-medium">Format</th>
            <th class="px-3 py-2 text-right font-medium">P.U.</th>
            <th class="px-3 py-2 text-right font-medium">Qté</th>
            <th class="px-3 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          {#each o.lines as l (l.slug + l.format)}
            <tr>
              <td class="px-3 py-2">
                {#if l.slug}<a href="/livre/{l.slug}" class="font-medium hover:text-link">{l.title}</a>{:else}<span class="font-medium">{l.title}</span>{/if}
              </td>
              <td class="px-3 py-2 text-muted-foreground">{fmtFormat(l.format)}</td>
              <td class="px-3 py-2 text-right tabular-nums">{euros(l.unit_price)}</td>
              <td class="px-3 py-2 text-right tabular-nums">{l.qty}</td>
              <td class="px-3 py-2 text-right tabular-nums">{euros(l.line_total)}</td>
            </tr>
          {/each}
        </tbody>
        <tfoot class="border-t border-border">
          <tr><td colspan="4" class="px-3 py-1.5 text-right text-muted-foreground">Sous-total</td><td class="px-3 py-1.5 text-right tabular-nums">{euros(o.subtotal)}</td></tr>
          <tr><td colspan="4" class="px-3 py-1.5 text-right text-muted-foreground">Livraison</td><td class="px-3 py-1.5 text-right tabular-nums">{o.shipping_total ? euros(o.shipping_total) : 'Offerte'}</td></tr>
          <tr class="font-bold"><td colspan="4" class="px-3 py-2 text-right">Total</td><td class="px-3 py-2 text-right tabular-nums">{euros(o.total)}</td></tr>
        </tfoot>
      </table>
    </div>

    <!-- Changement de statut -->
    <form method="POST" action="?/status" use:enhance class="rounded-lg border border-border bg-card p-4">
      <h3 class="mb-3 text-sm font-semibold">Mettre à jour le statut</h3>
      {#if form?.error}<p class="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}
      <div class="flex flex-wrap items-center gap-2">
        <select name="status" value={o.status} class="h-10 rounded-md border border-border bg-background px-3 text-sm">
          {#each Object.entries(ORDER_STATUS_LABEL) as [k, v] (k)}<option value={k}>{v}</option>{/each}
        </select>
        <Button type="submit"><Check size={16} /> Enregistrer</Button>
      </div>
    </form>
  </div>

  <!-- Client / adresses -->
  <div class="space-y-4">
    <div class="rounded-lg border border-border bg-card p-4">
      <h3 class="mb-2 text-sm font-semibold">Client</h3>
      <p class="text-sm">{o.email || (billing[billing.length - 1] ?? '—')}</p>
    </div>
    {#if billing.length}
      <div class="rounded-lg border border-border bg-card p-4">
        <h3 class="mb-2 text-sm font-semibold">Facturation</h3>
        <address class="space-y-0.5 text-sm not-italic text-muted-foreground">
          {#each billing as line (line)}<div>{line}</div>{/each}
        </address>
      </div>
    {/if}
    {#if shipping.length}
      <div class="rounded-lg border border-border bg-card p-4">
        <h3 class="mb-2 text-sm font-semibold">Livraison</h3>
        <address class="space-y-0.5 text-sm not-italic text-muted-foreground">
          {#each shipping as line (line)}<div>{line}</div>{/each}
        </address>
      </div>
    {/if}
  </div>
</div>
