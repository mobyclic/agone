<script lang="ts">
  import FactureForm from '$lib/components/FactureForm.svelte';
  import { ArrowLeft } from 'phosphor-svelte';
  let { data } = $props();
</script>

<svelte:head><title>Brouillon · Facturation · Admin</title></svelte:head>

<a href="/admin/factures" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Facturation</a>
<div class="mb-4 flex flex-wrap items-baseline gap-3">
  <h2 class="text-xl font-bold">Brouillon {data.doc.kind === 'credit_note' ? 'd’avoir' : 'de facture'}</h2>
  <span class="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">non émis — sans numéro</span>
  {#if data.doc.proforma_ref}<span class="text-xs text-muted-foreground">ancienne pro forma {data.doc.proforma_ref}</span>{/if}
</div>

{#key data.doc.id}
  <FactureForm vatRates={data.vatRates} defaultVat={data.defaultVat} initial={{ doc: data.doc }} brouillon />
{/key}
