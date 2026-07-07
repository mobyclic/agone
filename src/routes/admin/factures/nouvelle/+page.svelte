<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, FloppyDisk, Plus, Trash, MagnifyingGlass, X } from 'phosphor-svelte';

  let { data, form } = $props();
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const label = 'mb-1 block text-sm font-medium';
  const euro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
  const vatLabel = (r: number) => `${String(r).replace('.', ',')} %`;

  let kind = $state<'invoice' | 'credit_note'>('invoice');
  let baseVat = $state(untrack(() => data.defaultVat)); // TVA de base : défaut des nouvelles lignes
  let notes = $state('');

  // Client (nom manuel + recherche optionnelle)
  let name = $state(''), email = $state(''), address_1 = $state(''), postcode = $state(''), city = $state(''), country = $state('France');
  let customerId = $state('');
  let cq = $state('');
  let chits = $state<{ id: string; full_name: string; email?: string }[]>([]);
  let ctimer: ReturnType<typeof setTimeout>;
  function csearch() {
    clearTimeout(ctimer);
    const t = cq.trim();
    if (t.length < 2) { chits = []; return; }
    ctimer = setTimeout(async () => {
      const r = await fetch(`/admin/api/customers?q=${encodeURIComponent(t)}`);
      chits = r.ok ? (await r.json()).results : [];
    }, 200);
  }
  function pickClient(c: { id: string; full_name: string; email?: string }) {
    customerId = c.id; name = c.full_name; email = c.email ?? ''; cq = ''; chits = [];
  }

  // Lignes (TVA par ligne)
  type Line = { description: string; qty: number; unit_price_ttc: number; vat_rate: number };
  let lines = $state<Line[]>(untrack(() => [{ description: '', qty: 1, unit_price_ttc: 0, vat_rate: data.defaultVat }]));
  const addLine = () => (lines = [...lines, { description: '', qty: 1, unit_price_ttc: 0, vat_rate: baseVat }]);
  const total = $derived(lines.reduce((s, l) => s + l.qty * l.unit_price_ttc, 0));
</script>

<svelte:head><title>Nouvelle facture · Admin Agone</title></svelte:head>

<a href="/admin/factures" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
  <ArrowLeft size={16} /> Facturation
</a>

<form method="POST" action="?/save" use:enhance class="max-w-3xl">
  <div class="mb-4"><h2 class="text-xl font-bold">Facture / avoir manuel</h2></div>
  {#if form?.error}<p class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}

  <!-- Type -->
  <section class="mb-5 flex items-center gap-3 rounded-lg border border-border bg-card p-4">
    <span class="text-sm font-medium">Type :</span>
    <div class="flex overflow-hidden rounded-md border border-border text-sm">
      <button type="button" class="px-3 py-1.5 {kind === 'invoice' ? 'bg-foreground text-background' : ''}" onclick={() => (kind = 'invoice')}>Facture</button>
      <button type="button" class="px-3 py-1.5 {kind === 'credit_note' ? 'bg-foreground text-background' : ''}" onclick={() => (kind = 'credit_note')}>Avoir</button>
    </div>
    <div class="ml-auto flex items-center gap-2">
      <span class="text-sm text-muted-foreground">TVA de base</span>
      <select bind:value={baseVat} class="h-9 rounded-md border border-border bg-background px-2 text-sm">
        {#each data.vatRates as r (r)}<option value={r}>{vatLabel(r)}</option>{/each}
      </select>
    </div>
  </section>

  <!-- Client -->
  <section class="mb-5 rounded-lg border border-border bg-card p-4">
    <h3 class="eyebrow mb-3">Facturé à</h3>
    <div class="relative mb-3">
      <MagnifyingGlass size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input bind:value={cq} oninput={csearch} placeholder="Pré-remplir depuis un client existant…" autocomplete="off" class="{input} pl-9" />
      {#if chits.length}
        <ul class="absolute z-10 mt-1 w-full divide-y divide-border overflow-hidden rounded-md border border-border bg-background shadow-lg">
          {#each chits as c (c.id)}
            <li><button type="button" class="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/40" onclick={() => pickClient(c)}><span class="font-medium">{c.full_name}</span>{#if c.email}<span class="text-xs text-muted-foreground">{c.email}</span>{/if}</button></li>
          {/each}
        </ul>
      {/if}
    </div>
    {#if customerId}<p class="mb-3 flex items-center gap-2 text-xs text-muted-foreground">Lié au compte client <button type="button" onclick={() => (customerId = '')} class="hover:text-foreground"><X size={12} /></button></p>{/if}
    <div class="grid gap-3 sm:grid-cols-2">
      <label class="sm:col-span-2"><span class={label}>Nom / raison sociale</span><input bind:value={name} class={input} /></label>
      <label class="sm:col-span-2"><span class={label}>Email</span><input bind:value={email} type="email" class={input} /></label>
      <label class="sm:col-span-2"><span class={label}>Adresse</span><input bind:value={address_1} class={input} /></label>
      <label><span class={label}>Code postal</span><input bind:value={postcode} class={input} /></label>
      <label><span class={label}>Ville</span><input bind:value={city} class={input} /></label>
      <label><span class={label}>Pays</span><input bind:value={country} class={input} /></label>
    </div>
  </section>

  <!-- Lignes -->
  <section class="mb-5 rounded-lg border border-border bg-card p-4">
    <div class="mb-2 flex items-center justify-between">
      <h3 class="eyebrow">Lignes <span class="font-normal normal-case text-muted-foreground">(prix TTC)</span></h3>
      <button type="button" class="inline-flex items-center gap-1 text-sm text-link hover:underline" onclick={addLine}><Plus size={14} /> Ajouter</button>
    </div>
    <div class="mb-1 flex items-center gap-2 px-1 text-[11px] uppercase tracking-wide text-muted-foreground">
      <span class="flex-1">Désignation</span>
      <span class="w-14 text-center">Qté</span>
      <span class="w-24 text-right">P.U. TTC</span>
      <span class="w-[84px] text-center">TVA</span>
      <span class="w-20 text-right">Total</span>
      <span class="w-5"></span>
    </div>
    <div class="space-y-2">
      {#each lines as l, i (i)}
        <div class="flex items-center gap-2">
          <input bind:value={l.description} placeholder="Désignation" class="h-9 flex-1 rounded border border-border bg-background px-2 text-sm" />
          <input type="number" min="1" bind:value={l.qty} class="h-9 w-14 rounded border border-border bg-background px-2 text-center text-sm" />
          <input type="number" min="0" step="0.01" bind:value={l.unit_price_ttc} class="h-9 w-24 rounded border border-border bg-background px-2 text-right text-sm" />
          <select bind:value={l.vat_rate} class="h-9 w-[84px] rounded border border-border bg-background px-1 text-center text-sm">
            {#each data.vatRates as r (r)}<option value={r}>{vatLabel(r)}</option>{/each}
          </select>
          <span class="w-20 text-right text-sm tabular-nums text-muted-foreground">{euro(l.qty * l.unit_price_ttc)}</span>
          <button type="button" class="text-muted-foreground hover:text-destructive" onclick={() => (lines = lines.filter((_, j) => j !== i))} aria-label="Retirer"><Trash size={15} /></button>
        </div>
      {/each}
    </div>
    <div class="mt-3 border-t border-border pt-2 text-right text-sm font-semibold">Total TTC : {euro(total)}</div>
  </section>

  <section class="mb-5 rounded-lg border border-border bg-card p-4">
    <span class={label}>Notes</span>
    <textarea bind:value={notes} rows="2" class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"></textarea>
  </section>

  <!-- Champs cachés -->
  <input type="hidden" name="kind" value={kind} />
  <input type="hidden" name="vat_rate" value={baseVat} />
  <input type="hidden" name="customerId" value={customerId} />
  <input type="hidden" name="name" value={name} />
  <input type="hidden" name="email" value={email} />
  <input type="hidden" name="address_1" value={address_1} />
  <input type="hidden" name="postcode" value={postcode} />
  <input type="hidden" name="city" value={city} />
  <input type="hidden" name="country" value={country} />
  <input type="hidden" name="notes" value={notes} />
  <input type="hidden" name="lines" value={JSON.stringify(lines)} />

  <div class="fixed bottom-6 right-6 z-40">
    <Button type="submit" variant="brand" class="shadow-2xl"><FloppyDisk size={16} /> Créer</Button>
  </div>
</form>
