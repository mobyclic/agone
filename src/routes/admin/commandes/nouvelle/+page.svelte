<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, FloppyDisk, MagnifyingGlass, Plus, Trash, X } from 'phosphor-svelte';

  let { form } = $props();

  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const label = 'mb-1 block text-sm font-medium';
  const euro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

  // — Client —
  let mode = $state<'existing' | 'new'>('existing');
  let cq = $state('');
  let chits = $state<{ id: string; full_name: string; email?: string }[]>([]);
  let client = $state<{ id: string; full_name: string; email?: string } | null>(null);
  let ctimer: ReturnType<typeof setTimeout>;
  let nf = $state(''), nl = $state(''), ne = $state('');

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
    client = c; cq = ''; chits = [];
  }

  // — Type / statut —
  let channel = $state('comptoir');
  let status = $state('paid');

  // — Lignes —
  type Line = { bookId: string; title: string; isbn?: string; format: string; qty: number; unit_price: number };
  let lines = $state<Line[]>([]);
  let bq = $state('');
  let bhits = $state<{ id: string; title: string; price_paper?: number; price_ebook?: number; isbn_paper?: string }[]>([]);
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
  function addBook(b: { id: string; title: string; price_paper?: number; isbn_paper?: string }) {
    lines = [...lines, { bookId: b.id, title: b.title, isbn: b.isbn_paper, format: 'papier', qty: 1, unit_price: b.price_paper ?? 0 }];
    bq = ''; bhits = [];
  }
  const total = $derived(lines.reduce((s, l) => s + l.qty * l.unit_price, 0));

  // — Livraison —
  let sf = $state(''), sl = $state(''), sa = $state(''), sp = $state(''), sc = $state(''), sco = $state('France');
</script>

<svelte:head><title>Nouvelle commande · Admin Agone</title></svelte:head>

<a href="/admin/commandes" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
  <ArrowLeft size={16} /> Commandes
</a>

<form method="POST" action="?/save" use:enhance class="max-w-3xl">
  <div class="mb-4">
    <h2 class="text-xl font-bold">Nouvelle commande</h2>
  </div>

  {#if form?.error}<p class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}

  <!-- Client -->
  <section class="mb-5 rounded-lg border border-border bg-card p-4">
    <div class="mb-3 flex items-center justify-between">
      <h3 class="eyebrow">Client</h3>
      <div class="flex overflow-hidden rounded-md border border-border text-xs">
        <button type="button" class="px-3 py-1 {mode === 'existing' ? 'bg-foreground text-background' : ''}" onclick={() => (mode = 'existing')}>Existant</button>
        <button type="button" class="px-3 py-1 {mode === 'new' ? 'bg-foreground text-background' : ''}" onclick={() => (mode = 'new')}>Nouveau</button>
      </div>
    </div>

    {#if mode === 'existing'}
      {#if client}
        <div class="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
          <span class="text-sm"><span class="font-medium">{client.full_name}</span>{#if client.email} · <span class="text-muted-foreground">{client.email}</span>{/if}</span>
          <button type="button" class="text-muted-foreground hover:text-foreground" onclick={() => (client = null)} aria-label="Retirer"><X size={16} /></button>
        </div>
      {:else}
        <div class="relative">
          <MagnifyingGlass size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input bind:value={cq} oninput={csearch} placeholder="Rechercher un client (nom ou email)…" autocomplete="off" class="{input} pl-9" />
        </div>
        {#if chits.length}
          <ul class="mt-1 divide-y divide-border overflow-hidden rounded-md border border-border">
            {#each chits as c (c.id)}
              <li><button type="button" class="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/40" onclick={() => pickClient(c)}>
                <span class="font-medium">{c.full_name}</span>{#if c.email}<span class="text-xs text-muted-foreground">{c.email}</span>{/if}
              </button></li>
            {/each}
          </ul>
        {/if}
      {/if}
    {:else}
      <div class="grid gap-3 sm:grid-cols-3">
        <label class={label}>Prénom <input bind:value={nf} class={input} /></label>
        <label class={label}>Nom <input bind:value={nl} class={input} /></label>
        <label class={label}>Email <input bind:value={ne} type="email" class={input} /></label>
      </div>
      <p class="mt-2 text-xs text-muted-foreground">Un compte client sera créé (ou réutilisé si l’email existe déjà).</p>
    {/if}
  </section>

  <!-- Type + statut -->
  <section class="mb-5 grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
    <label class={label}>Type de commande
      <select bind:value={channel} class={input}>
        <option value="comptoir">Comptoir (sur place)</option>
        <option value="vpc">VPC (→ Belles Lettres)</option>
        <option value="sortie_editeur">Sortie éditeur (bon de livraison)</option>
      </select>
    </label>
    <label class={label}>Statut initial
      <select bind:value={status} class={input}>
        <option value="paid">Payée</option>
        <option value="pending">En attente</option>
        <option value="processing">En préparation</option>
        <option value="completed">Terminée</option>
      </select>
    </label>
  </section>

  <!-- Lignes -->
  <section class="mb-5 rounded-lg border border-border bg-card p-4">
    <h3 class="eyebrow mb-3">Livres</h3>

    <div class="relative">
      <MagnifyingGlass size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input bind:value={bq} oninput={bsearch} placeholder="Ajouter un livre (titre ou ISBN)…" autocomplete="off" class="{input} pl-9" />
    </div>
    {#if bhits.length}
      <ul class="mt-1 divide-y divide-border overflow-hidden rounded-md border border-border">
        {#each bhits as b (b.id)}
          <li><button type="button" class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/40" onclick={() => addBook(b)}>
            <span class="min-w-0 flex-1 truncate font-medium">{b.title}</span>
            <span class="shrink-0 text-xs text-muted-foreground">{b.price_paper != null ? euro(b.price_paper) : '—'}</span>
            <Plus size={15} class="shrink-0 text-muted-foreground" />
          </button></li>
        {/each}
      </ul>
    {/if}

    {#if lines.length}
      <div class="mt-3 overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-left text-xs uppercase text-muted-foreground">
            <tr><th class="py-1 font-medium">Titre</th><th class="py-1 font-medium">Format</th><th class="py-1 text-center font-medium">Qté</th><th class="py-1 text-right font-medium">P.U. TTC</th><th class="py-1 text-right font-medium">Total</th><th></th></tr>
          </thead>
          <tbody class="divide-y divide-border">
            {#each lines as l, i (i)}
              <tr>
                <td class="py-2 pr-2"><span class="font-medium">{l.title}</span>{#if l.isbn}<span class="block text-[11px] text-muted-foreground">{l.isbn}</span>{/if}</td>
                <td class="py-2 pr-2">
                  <select bind:value={l.format} class="h-8 rounded border border-border bg-background px-2 text-xs">
                    <option value="papier">Papier</option>
                    <option value="epub">ePub</option>
                    <option value="souscription">Souscription</option>
                  </select>
                </td>
                <td class="py-2 text-center"><input type="number" min="1" bind:value={l.qty} class="h-8 w-14 rounded border border-border bg-background px-2 text-center text-sm" /></td>
                <td class="py-2 text-right">
                  <span class="inline-flex items-center gap-1">
                    <input type="number" min="0" step="0.01" bind:value={l.unit_price} class="h-8 w-20 rounded border border-border bg-background px-2 text-right text-sm" />
                    <button type="button" class="rounded border border-border px-1.5 py-1 text-[10px] uppercase text-muted-foreground hover:bg-muted" title="Offrir" onclick={() => (l.unit_price = 0)}>Gratuit</button>
                  </span>
                </td>
                <td class="py-2 text-right tabular-nums">{euro(l.qty * l.unit_price)}</td>
                <td class="py-2 pl-2 text-right"><button type="button" class="text-muted-foreground hover:text-destructive" onclick={() => (lines = lines.filter((_, j) => j !== i))} aria-label="Retirer"><Trash size={15} /></button></td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr class="border-t border-border font-semibold"><td colspan="4" class="py-2 text-right">Total TTC</td><td class="py-2 text-right tabular-nums">{euro(total)}</td><td></td></tr>
          </tfoot>
        </table>
      </div>
    {:else}
      <p class="mt-3 text-sm text-muted-foreground">Aucun livre pour l’instant. Utilisez la recherche ci-dessus.</p>
    {/if}
  </section>

  <!-- Livraison (optionnelle) -->
  <section class="mb-5 rounded-lg border border-border bg-card p-4">
    <h3 class="eyebrow mb-3">Adresse de livraison <span class="font-normal normal-case text-muted-foreground">(optionnelle — VPC / sortie éditeur)</span></h3>
    <div class="grid gap-3 sm:grid-cols-2">
      <label class={label}>Prénom <input bind:value={sf} class={input} /></label>
      <label class={label}>Nom <input bind:value={sl} class={input} /></label>
      <label class="{label} sm:col-span-2">Adresse <input bind:value={sa} class={input} /></label>
      <label class={label}>Code postal <input bind:value={sp} class={input} /></label>
      <label class={label}>Ville <input bind:value={sc} class={input} /></label>
      <label class={label}>Pays <input bind:value={sco} class={input} /></label>
    </div>
  </section>

  <!-- Champs cachés pour l'action -->
  <input type="hidden" name="customerMode" value={mode} />
  <input type="hidden" name="customerId" value={client?.id ?? ''} />
  <input type="hidden" name="newFirst" value={nf} />
  <input type="hidden" name="newLast" value={nl} />
  <input type="hidden" name="newEmail" value={ne} />
  <input type="hidden" name="channel" value={channel} />
  <input type="hidden" name="status" value={status} />
  <input type="hidden" name="ship_first" value={sf} />
  <input type="hidden" name="ship_last" value={sl} />
  <input type="hidden" name="ship_address" value={sa} />
  <input type="hidden" name="ship_postcode" value={sp} />
  <input type="hidden" name="ship_city" value={sc} />
  <input type="hidden" name="ship_country" value={sco} />
  <input type="hidden" name="lines" value={JSON.stringify(lines)} />

  <!-- Bouton flottant -->
  <div class="fixed bottom-6 right-6 z-40">
    <Button type="submit" variant="brand" class="shadow-2xl"><FloppyDisk size={16} /> Créer la commande</Button>
  </div>
</form>
