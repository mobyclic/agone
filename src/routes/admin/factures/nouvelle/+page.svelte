<script lang="ts">
  import FactureForm from '$lib/components/FactureForm.svelte';
  import { ArrowLeft } from 'phosphor-svelte';
  let { data } = $props();
</script>

<svelte:head><title>Nouvelle facture · Admin Agone</title></svelte:head>

<a href="/admin/factures" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Facturation</a>
<div class="mb-4"><h2 class="text-xl font-bold">Nouvelle facture ou avoir</h2><p class="text-sm text-muted-foreground">Le document naît en brouillon ; émettez-le quand il est prêt, ou soumettez-le en pro forma.</p></div>

<FactureForm vatRates={data.vatRates} defaultVat={data.defaultVat} initial={data.pro ? { pro: data.pro } : null} />
