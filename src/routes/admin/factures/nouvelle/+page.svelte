<script lang="ts">
  /**
   * Facture ou avoir à la main. Le client vient de la recherche (professionnel ou
   * particulier) ou se saisit ; les lignes viennent du catalogue (titre ou ISBN,
   * prix et TVA du livre, modifiables) ou sont libres. Les prix se saisissent HT
   * (professionnels) ou TTC (particuliers) : le document s'imprime dans ce sens.
   */
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, FloppyDisk, Plus, Trash, MagnifyingGlass, X, Buildings, User, BookOpen } from 'phosphor-svelte';

  let { data } = $props();
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const label = 'mb-1 block text-sm font-medium';
  const euro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
  const vatLabel = (r: number) => `${String(r).replace('.', ',')} %`;

  let kind = $state<'invoice' | 'credit_note' | 'proforma'>('invoice');
  let baseVat = $state(untrack(() => data.defaultVat));
  let mode = $state<'ht' | 'ttc'>(untrack(() => (data.pro ? 'ht' : 'ttc')));
  let issuedAt = $state(new Date().toISOString().slice(0, 10));
  let intro = $state('');
  let notes = $state('');

  // ── Client : recherche mêlée (professionnels et particuliers), ou saisie libre ──
  type Choix = { type: 'pro' | 'user'; id: string; label: string; detail?: string; bill_to: Record<string, any> };
  let clientId = $state(untrack(() => data.pro?.id ?? ''));
  let customerId = $state('');
  let clientType = $state<'pro' | 'user' | ''>(untrack(() => (data.pro ? 'pro' : '')));
  let name = $state(untrack(() => data.pro?.name ?? '')), email = $state(untrack(() => data.pro?.email ?? '')), address_1 = $state(untrack(() => [data.pro?.address_1, data.pro?.address_2].filter(Boolean).join(', ')));
  let postcode = $state(untrack(() => data.pro?.postcode ?? '')), city = $state(untrack(() => data.pro?.city ?? '')), country = $state(untrack(() => data.pro?.country ?? 'France'));
  let vatNumber = $state(untrack(() => data.pro?.vat_number ?? '')), siret = $state(untrack(() => data.pro?.siret ?? '')), contactName = $state(untrack(() => data.pro?.contact_name ?? ''));
  let cq = $state('');
  let chits = $state<Choix[]>([]);
  let ctimer: ReturnType<typeof setTimeout>;
  function csearch() {
    clearTimeout(ctimer);
    const t = cq.trim();
    if (t.length < 2) { chits = []; return; }
    ctimer = setTimeout(async () => {
      const r = await fetch(`/admin/api/clients?q=${encodeURIComponent(t)}`);
      chits = r.ok ? (await r.json()).results : [];
    }, 200);
  }
  function pickClient(c: Choix) {
    clientType = c.type; clientId = c.type === 'pro' ? c.id : ''; customerId = c.type === 'user' ? c.id : '';
    const b = c.bill_to;
    name = b.name ?? ''; email = b.email ?? ''; address_1 = b.address_1 ?? ''; postcode = b.postcode ?? ''; city = b.city ?? ''; country = b.country ?? 'France';
    vatNumber = b.vat_number ?? ''; siret = b.siret ?? ''; contactName = b.contact_name ?? '';
    if (c.type === 'pro') mode = 'ht';
    cq = ''; chits = [];
  }
  function detacher() { clientType = ''; clientId = ''; customerId = ''; }

  // ── Lignes : depuis le catalogue (prix et TVA du livre) ou libres ──
  type Line = { description: string; qty: number; unit_price: number; vat_rate: number; book?: string; isbn?: string; catalogue_ttc?: number };
  let lines = $state<Line[]>([]);
  let bq = $state('');
  let bhits = $state<{ id: string; title: string; price_paper?: number; price_ebook?: number; isbn_paper?: string; vat_rate?: number }[]>([]);
  let btimer: ReturnType<typeof setTimeout>;
  function bsearch() {
    clearTimeout(btimer);
    const t = bq.trim();
    if (t.length < 2) { bhits = []; return; }
    btimer = setTimeout(async () => {
      const r = await fetch(`/admin/api/books?q=${encodeURIComponent(t)}`);
      bhits = r.ok ? (await r.json()).results : [];
    }, 200);
  }
  const prixSaisi = (ttc: number, vat: number) => (mode === 'ht' ? Math.round((ttc / (1 + vat / 100)) * 100) / 100 : ttc);
  function addBook(b: { id: string; title: string; price_paper?: number; isbn_paper?: string; vat_rate?: number }) {
    const vat = b.vat_rate ?? baseVat;
    const ttc = b.price_paper ?? 0;
    lines = [...lines, { description: `${b.isbn_paper ? `${b.isbn_paper} – ` : ''}${b.title}`, qty: 1, unit_price: prixSaisi(ttc, vat), vat_rate: vat, book: b.id, isbn: b.isbn_paper, catalogue_ttc: ttc }];
    bq = ''; bhits = [];
  }
  const addLine = () => (lines = [...lines, { description: '', qty: 1, unit_price: 0, vat_rate: baseVat }]);
  // Changer de sens convertit les prix déjà saisis, pour ne pas tromper l'opérateur.
  function basculerMode(m: 'ht' | 'ttc') {
    if (m === mode) return;
    lines = lines.map((l) => ({ ...l, unit_price: Math.round((m === 'ht' ? l.unit_price / (1 + l.vat_rate / 100) : l.unit_price * (1 + l.vat_rate / 100)) * 100) / 100 }));
    mode = m;
  }
  const ttcDe = (l: Line) => (mode === 'ht' ? l.unit_price * (1 + l.vat_rate / 100) : l.unit_price);
  const htDe = (l: Line) => (mode === 'ht' ? l.unit_price : l.unit_price / (1 + l.vat_rate / 100));
  const totalHT = $derived(lines.reduce((s, l) => s + l.qty * htDe(l), 0));
  const totalTTC = $derived(lines.reduce((s, l) => s + l.qty * ttcDe(l), 0));
</script>

<svelte:head><title>Nouvelle facture · Admin Agone</title></svelte:head>

<a href="/admin/factures" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
  <ArrowLeft size={16} /> Facturation
</a>

<form method="POST" action="?/save" use:enhance class="max-w-3xl">
  <div class="mb-4"><h2 class="text-xl font-bold">Facture, pro forma ou avoir</h2></div>

  <!-- Type, sens des prix, date -->
  <section class="mb-5 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border border-border bg-card p-4">
    <div class="flex items-center gap-2">
      <span class="text-sm font-medium">Type</span>
      <div class="flex overflow-hidden rounded-md border border-border text-sm">
        <button type="button" class="px-3 py-1.5 {kind === 'invoice' ? 'bg-foreground text-background' : ''}" onclick={() => (kind = 'invoice')}>Facture</button>
        <button type="button" class="px-3 py-1.5 {kind === 'proforma' ? 'bg-foreground text-background' : ''}" onclick={() => (kind = 'proforma')} title="Sans valeur comptable, numérotée à part ; la facture définitive naît de sa validation.">Pro forma</button>
        <button type="button" class="px-3 py-1.5 {kind === 'credit_note' ? 'bg-foreground text-background' : ''}" onclick={() => (kind = 'credit_note')}>Avoir</button>
      </div>
    </div>
    <div class="flex items-center gap-2" title="Les prix des lignes sont saisis dans ce sens, et le document s’imprime de même.">
      <span class="text-sm font-medium">Prix</span>
      <div class="flex overflow-hidden rounded-md border border-border text-sm">
        <button type="button" class="px-3 py-1.5 {mode === 'ht' ? 'bg-foreground text-background' : ''}" onclick={() => basculerMode('ht')}>HT</button>
        <button type="button" class="px-3 py-1.5 {mode === 'ttc' ? 'bg-foreground text-background' : ''}" onclick={() => basculerMode('ttc')}>TTC</button>
      </div>
    </div>
    <label class="flex items-center gap-2 text-sm"><span class="font-medium">Date</span><input type="date" bind:value={issuedAt} class="h-9 rounded-md border border-border bg-background px-2 text-sm" /></label>
    <div class="ml-auto flex items-center gap-2">
      <span class="text-sm text-muted-foreground">TVA des lignes libres</span>
      <select bind:value={baseVat} class="h-9 rounded-md border border-border bg-background px-2 text-sm">
        {#each data.vatRates as r (r)}<option value={r}>{vatLabel(r)}</option>{/each}
      </select>
    </div>
  </section>

  <!-- Client -->
  <section class="mb-5 rounded-lg border border-border bg-card p-4">
    <h3 class="eyebrow mb-3">Facturé à</h3>
    {#if clientType}
      <p class="mb-3 flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
        {#if clientType === 'pro'}<Buildings size={15} class="text-muted-foreground" />{:else}<User size={15} class="text-muted-foreground" />{/if}
        <span class="font-medium">{name}</span>
        <span class="text-xs text-muted-foreground">{clientType === 'pro' ? 'client professionnel' : 'client du site'}</span>
        <button type="button" onclick={detacher} class="ml-auto text-muted-foreground hover:text-foreground" aria-label="Détacher"><X size={14} /></button>
      </p>
    {:else}
      <div class="relative mb-3">
        <MagnifyingGlass size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input bind:value={cq} oninput={csearch} placeholder="Chercher un client — professionnel ou particulier…" autocomplete="off" class="{input} pl-9" />
        {#if chits.length}
          <ul class="absolute z-10 mt-1 w-full divide-y divide-border overflow-hidden rounded-md border border-border bg-background shadow-lg">
            {#each chits as c (c.type + c.id)}
              <li><button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40" onclick={() => pickClient(c)}>
                {#if c.type === 'pro'}<Buildings size={15} class="shrink-0 text-muted-foreground" />{:else}<User size={15} class="shrink-0 text-muted-foreground" />{/if}
                <span class="font-medium">{c.label}</span>{#if c.detail}<span class="ml-auto text-xs text-muted-foreground">{c.detail}</span>{/if}
              </button></li>
            {/each}
          </ul>
        {/if}
      </div>
      <p class="mb-3 text-xs text-muted-foreground">Ou saisissez le client ci-dessous — pour une personne morale récurrente, <a href="/admin/clients/pro/nouveau" class="text-link hover:underline">créez-la</a> plutôt dans Clients.</p>
    {/if}
    <div class="grid gap-3 sm:grid-cols-2">
      <label class="sm:col-span-2"><span class={label}>Nom / raison sociale</span><input bind:value={name} class={input} /></label>
      <label><span class={label}>À l’attention de</span><input bind:value={contactName} class={input} /></label>
      <label><span class={label}>Email</span><input bind:value={email} type="email" class={input} /></label>
      <label class="sm:col-span-2"><span class={label}>Adresse</span><input bind:value={address_1} class={input} /></label>
      <label><span class={label}>Code postal</span><input bind:value={postcode} class={input} /></label>
      <label><span class={label}>Ville</span><input bind:value={city} class={input} /></label>
      <label><span class={label}>Pays</span><input bind:value={country} class={input} /></label>
      <label><span class={label}>N° TVA / SIRET</span><div class="flex gap-2"><input bind:value={vatNumber} placeholder="FR…" class="{input} font-mono" /><input bind:value={siret} placeholder="SIRET" class="{input} font-mono" /></div></label>
    </div>
  </section>

  <!-- Objet -->
  <section class="mb-5 rounded-lg border border-border bg-card p-4">
    <span class={label}>Objet <span class="font-normal text-muted-foreground">(imprimé avant le tableau : « 500 exemplaires à prix coûtant tel qu’énoncé dans le contrat… »)</span></span>
    <textarea bind:value={intro} rows="2" class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"></textarea>
  </section>

  <!-- Lignes -->
  <section class="mb-5 rounded-lg border border-border bg-card p-4">
    <div class="mb-2 flex items-center justify-between">
      <h3 class="eyebrow">Lignes <span class="font-normal normal-case text-muted-foreground">(prix {mode === 'ht' ? 'HT' : 'TTC'})</span></h3>
      <button type="button" class="inline-flex items-center gap-1 text-sm text-link hover:underline" onclick={addLine}><Plus size={14} /> Ligne libre</button>
    </div>
    <div class="relative mb-3">
      <BookOpen size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input bind:value={bq} oninput={bsearch} placeholder="Ajouter un titre du catalogue (titre ou ISBN)…" autocomplete="off" class="{input} pl-9" />
      {#if bhits.length}
        <ul class="absolute z-10 mt-1 w-full divide-y divide-border overflow-hidden rounded-md border border-border bg-background shadow-lg">
          {#each bhits as b (b.id)}
            <li><button type="button" class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/40" onclick={() => addBook(b)}>
              <span class="min-w-0 flex-1 truncate"><span class="font-medium">{b.title}</span>{#if b.isbn_paper}<span class="ml-1.5 font-mono text-xs text-muted-foreground">{b.isbn_paper}</span>{/if}</span>
              <span class="shrink-0 text-xs text-muted-foreground">{b.price_paper != null ? `${euro(b.price_paper)} TTC · TVA ${vatLabel(b.vat_rate ?? 5.5)}` : '—'}</span>
            </button></li>
          {/each}
        </ul>
      {/if}
    </div>
    <div class="mb-1 flex items-center gap-2 px-1 text-[11px] uppercase tracking-wide text-muted-foreground">
      <span class="flex-1">Désignation</span>
      <span class="w-16 text-center">Qté</span>
      <span class="w-24 text-right">P.U. {mode === 'ht' ? 'HT' : 'TTC'}</span>
      <span class="w-[84px] text-center">TVA</span>
      <span class="w-24 text-right">Montant {mode === 'ht' ? 'HT' : 'TTC'}</span>
      <span class="w-5"></span>
    </div>
    <div class="space-y-2">
      {#each lines as l, i (i)}
        <div class="flex items-center gap-2">
          <div class="min-w-0 flex-1">
            <input bind:value={l.description} placeholder="Désignation" class="h-9 w-full rounded border border-border bg-background px-2 text-sm" />
            {#if l.catalogue_ttc != null && Math.abs(ttcDe(l) - l.catalogue_ttc) > 0.005}
              <span class="mt-0.5 block text-[11px] text-muted-foreground">prix spécifique — catalogue {euro(l.catalogue_ttc)} TTC</span>
            {/if}
          </div>
          <input type="number" min="1" bind:value={l.qty} class="h-9 w-16 rounded border border-border bg-background px-2 text-center text-sm" />
          <input type="number" min="0" step="0.01" bind:value={l.unit_price} class="h-9 w-24 rounded border border-border bg-background px-2 text-right text-sm" />
          <select bind:value={l.vat_rate} class="h-9 w-[84px] rounded border border-border bg-background px-1 text-center text-sm">
            {#each data.vatRates as r (r)}<option value={r}>{vatLabel(r)}</option>{/each}
          </select>
          <span class="w-24 text-right text-sm tabular-nums text-muted-foreground">{euro(l.qty * l.unit_price)}</span>
          <button type="button" class="text-muted-foreground hover:text-destructive" onclick={() => (lines = lines.filter((_, j) => j !== i))} aria-label="Retirer"><Trash size={15} /></button>
        </div>
      {/each}
      {#if lines.length === 0}<p class="py-3 text-center text-sm text-muted-foreground">Aucune ligne : cherchez un titre du catalogue ou ajoutez une ligne libre.</p>{/if}
    </div>
    <div class="mt-3 space-y-0.5 border-t border-border pt-2 text-right text-sm">
      <div class="text-muted-foreground">Total HT : {euro(totalHT)}</div>
      <div class="text-muted-foreground">TVA : {euro(totalTTC - totalHT)}</div>
      <div class="font-semibold">Total TTC : {euro(totalTTC)}</div>
    </div>
  </section>

  <section class="mb-5 rounded-lg border border-border bg-card p-4">
    <span class={label}>Notes <span class="font-normal text-muted-foreground">(imprimées après les totaux : adresse de livraison, conditions…)</span></span>
    <textarea bind:value={notes} rows="2" class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"></textarea>
  </section>

  <!-- Champs cachés -->
  <input type="hidden" name="kind" value={kind} />
  <input type="hidden" name="price_mode" value={mode} />
  <input type="hidden" name="issued_at" value={issuedAt} />
  <input type="hidden" name="vat_rate" value={baseVat} />
  <input type="hidden" name="customerId" value={customerId} />
  <input type="hidden" name="clientId" value={clientId} />
  <input type="hidden" name="name" value={name} />
  <input type="hidden" name="contact_name" value={contactName} />
  <input type="hidden" name="email" value={email} />
  <input type="hidden" name="address_1" value={address_1} />
  <input type="hidden" name="postcode" value={postcode} />
  <input type="hidden" name="city" value={city} />
  <input type="hidden" name="country" value={country} />
  <input type="hidden" name="vat_number" value={vatNumber} />
  <input type="hidden" name="siret" value={siret} />
  <input type="hidden" name="intro" value={intro} />
  <input type="hidden" name="notes" value={notes} />
  <input type="hidden" name="lines" value={JSON.stringify(lines)} />

  <div class="fixed bottom-6 right-6 z-40">
    <Button type="submit" variant="brand" class="shadow-2xl"><FloppyDisk size={16} /> Créer</Button>
  </div>
</form>
