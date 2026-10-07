<script lang="ts">
  /**
   * Facturation : la liste, un bouton « Trier & filtrer » (type, état, période,
   * tri, nombre par page) qui ouvre une fenêtre, des cases pour agir sur
   * plusieurs documents à la fois (export CSV, chiffres de la sélection), et une
   * pagination. Cliquer une ligne ouvre le document (un brouillon, en édition).
   */
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { SvelteSet } from 'svelte/reactivity';
  import { Button } from '$lib/components/ui/button';
  import Pagination from '$lib/components/Pagination.svelte';
  import { Plus, MagnifyingGlass, Download, Funnel, X, ChartBar, FileZip } from 'phosphor-svelte';
  import { euros } from '$lib/labels';

  let { data } = $props();
  const pageCount = $derived(Math.max(1, Math.ceil(data.total / data.limit)));
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  const STATUT: Record<string, { texte: string; cls: string }> = {
    draft: { texte: 'Brouillon', cls: 'bg-secondary text-muted-foreground' }, proforma: { texte: 'Pro forma', cls: 'bg-accent text-accent-foreground' },
    unpaid: { texte: 'À encaisser', cls: 'bg-warning/15 text-warning' }, partial: { texte: 'Partielle', cls: 'bg-warning/15 text-warning' },
    paid: { texte: 'Réglée', cls: 'bg-success/15 text-success' }, cancelled: { texte: 'Annulée', cls: 'bg-muted text-muted-foreground' }
  };
  const etat = (f: any) => STATUT[f.status ?? 'unpaid'] ?? STATUT.unpaid;
  const ETATS = [{ s: '', label: 'Tous' }, { s: 'draft', label: 'Brouillons' }, { s: 'proforma', label: 'Pro forma' }, { s: 'due', label: 'À encaisser' }, { s: 'partial', label: 'Partielles' }, { s: 'paid', label: 'Réglées' }, { s: 'cancelled', label: 'Annulées' }];
  const TRIS = [{ v: 'date_desc', label: 'Date, la plus récente d’abord' }, { v: 'date_asc', label: 'Date, la plus ancienne d’abord' }, { v: 'total_desc', label: 'Montant décroissant' }, { v: 'total_asc', label: 'Montant croissant' }, { v: 'ref', label: 'Numéro' }, { v: 'client', label: 'Client' }];

  // ── Navigation : tout passe par l'adresse, pour partager ou revenir ──
  let q = $state(untrack(() => data.q ?? ''));
  let timer: ReturnType<typeof setTimeout>;
  function nav(params: Record<string, string | number | undefined>) {
    const merged: Record<string, string | number | undefined> = {
      q, kind: data.kind, status: data.status, from: data.from, to: data.to, sort: data.sort, limit: data.limit, page: data.page, ...params
    };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === '' || (k === 'page' && v === 1) || (k === 'sort' && v === 'date_desc') || (k === 'limit' && v === 50)) continue;
      sp.set(k, String(v));
    }
    const s = sp.toString();
    goto(`/admin/factures${s ? `?${s}` : ''}`, { keepFocus: true, replaceState: true, noScroll: true });
  }
  function onSearch() { clearTimeout(timer); timer = setTimeout(() => nav({ q, page: 1 }), 220); }

  // ── Fenêtre « Trier & filtrer » ──
  let fenetre = $state(false);
  let fKind = $state(''), fStatus = $state(''), fFrom = $state(''), fTo = $state(''), fSort = $state('date_desc'), fLimit = $state(50);
  function ouvrir() { fKind = data.kind ?? ''; fStatus = data.status ?? ''; fFrom = data.from ?? ''; fTo = data.to ?? ''; fSort = data.sort ?? 'date_desc'; fLimit = data.limit; fenetre = true; }
  function appliquer() { fenetre = false; nav({ kind: fKind || undefined, status: fStatus || undefined, from: fFrom || undefined, to: fTo || undefined, sort: fSort, limit: fLimit, page: 1 }); }
  function reinitialiser() { fenetre = false; nav({ kind: undefined, status: undefined, from: undefined, to: undefined, sort: 'date_desc', limit: 50, page: 1 }); }
  const filtresActifs = $derived([
    data.kind ? (data.kind === 'credit_note' ? 'Avoirs' : 'Factures') : '',
    data.status ? ETATS.find((e) => e.s === data.status)?.label ?? data.status : '',
    data.from || data.to ? `${data.from ? `du ${dateFr(data.from)}` : ''} ${data.to ? `au ${dateFr(data.to)}` : ''}`.trim() : '',
    data.sort && data.sort !== 'date_desc' ? TRIS.find((t) => t.v === data.sort)?.label ?? '' : ''
  ].filter(Boolean));
  const parametresFiltre = $derived(new URLSearchParams(Object.fromEntries(Object.entries({ q, kind: data.kind, status: data.status, from: data.from, to: data.to, sort: data.sort }).filter(([, v]) => v)) as Record<string, string>).toString());
  const exportFiltre = $derived(`/admin/factures/export.csv?${parametresFiltre}`);
  const zipFiltre = $derived(`/admin/factures/export.zip?${parametresFiltre}`);

  // ── Sélection : cases à cocher, actions groupées ──
  let coches = $state(new SvelteSet<string>());
  const toutes = $derived(data.invoices.length > 0 && data.invoices.every((f: any) => coches.has(f.id)));
  function cocherTout(oui: boolean) { if (oui) for (const f of data.invoices) coches.add(f.id); else coches.clear(); }
  const selection = $derived(data.invoices.filter((f: any) => coches.has(f.id)));
  const idsSelection = $derived(selection.map((f: any) => f.id).join(','));
  let stats = $state(false);
  /** Les chiffres de la sélection, lus sur les lignes affichées (avoirs en négatif, annulées hors compte). */
  const chiffres = $derived.by(() => {
    const actives = selection.filter((f: any) => f.status !== 'cancelled' && f.status !== 'draft');
    const signe = (f: any) => (f.kind === 'credit_note' ? -1 : 1);
    const somme = (k: string) => actives.reduce((s: number, f: any) => s + signe(f) * Number(f[k] ?? 0), 0);
    const regle = actives.reduce((s: number, f: any) => s + Number(f.paid_total ?? 0), 0);
    const parEtat = new Map<string, number>();
    for (const f of selection) parEtat.set(f.status, (parEtat.get(f.status) ?? 0) + 1);
    const parClient = new Map<string, { n: number; ttc: number }>();
    for (const f of actives) { const e = parClient.get(f.name ?? '—') ?? { n: 0, ttc: 0 }; e.n++; e.ttc += signe(f) * Number(f.total_ttc ?? 0); parClient.set(f.name ?? '—', e); }
    return {
      n: selection.length, ht: somme('subtotal_ht'), tva: somme('tax_total'), ttc: somme('total_ttc'), regle,
      reste: actives.filter((f: any) => f.kind !== 'credit_note').reduce((s: number, f: any) => s + Math.max(0, Number(f.total_ttc ?? 0) - Number(f.paid_total ?? 0)), 0),
      parEtat: [...parEtat.entries()], parClient: [...parClient.entries()].sort((a, b) => b[1].ttc - a[1].ttc).slice(0, 8)
    };
  });
</script>

<svelte:head><title>Facturation · Admin Agone</title></svelte:head>

<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">Facturation</h2>
    <p class="text-sm text-muted-foreground">{data.total} document{data.total > 1 ? 's' : ''}{filtresActifs.length ? ' pour ce filtre' : ''}</p>
  </div>
  <Button href="/admin/factures/nouvelle"><Plus size={16} /> Nouvelle facture</Button>
</div>

<div class="mb-4 flex flex-wrap items-center gap-2">
  <div class="relative min-w-[240px] flex-1">
    <MagnifyingGlass size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input bind:value={q} oninput={onSearch} placeholder="N° de facture ou client…" autocomplete="off"
      class="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
  </div>
  <Button type="button" variant="outline" class="h-10" onclick={ouvrir}><Funnel size={16} /> Trier &amp; filtrer{#if filtresActifs.length}<span class="ml-1 rounded-full bg-foreground px-1.5 text-[10px] text-background">{filtresActifs.length}</span>{/if}</Button>
  {#each filtresActifs as f (f)}<span class="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">{f}</span>{/each}
  {#if filtresActifs.length}<button type="button" class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onclick={reinitialiser}><X size={12} /> Effacer</button>{/if}
  <div class="ml-auto flex gap-2">
    <a href={exportFiltre} class="inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted" title="Export CSV de tout ce filtre"><Download size={15} /> CSV</a>
    <a href={zipFiltre} class="inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted" title="Les PDF de tout ce filtre, en archive ZIP, avec le CSV (500 documents au plus)"><FileZip size={15} /> ZIP des PDF</a>
  </div>
</div>

<!-- Barre d'actions groupées, dès qu'une case est cochée -->
{#if selection.length}
  <div class="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-foreground/20 bg-muted/40 px-3 py-2 text-sm">
    <span class="font-medium">{selection.length} document{selection.length > 1 ? 's' : ''} coché{selection.length > 1 ? 's' : ''}</span>
    <a href="/admin/factures/export.csv?ids={idsSelection}" class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm hover:bg-muted"><Download size={14} /> CSV</a>
    <a href="/admin/factures/export.zip?ids={idsSelection}" class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm hover:bg-muted"><FileZip size={14} /> ZIP des PDF</a>
    <button type="button" class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm hover:bg-muted" onclick={() => (stats = true)}><ChartBar size={14} /> Chiffres de la sélection</button>
    <button type="button" class="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onclick={() => coches.clear()}><X size={12} /> Tout décocher</button>
  </div>
{/if}

<div class="overflow-x-auto rounded-lg border border-border bg-card">
  <table class="w-full text-sm">
    <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
      <tr>
        <th class="w-8 px-3 py-2"><input type="checkbox" checked={toutes} onchange={(e) => cocherTout(e.currentTarget.checked)} aria-label="Tout cocher" class="size-4" /></th>
        <th class="px-3 py-2 font-medium">N°</th>
        <th class="px-3 py-2 font-medium">Type</th>
        <th class="px-3 py-2 font-medium">Client</th>
        <th class="px-3 py-2 font-medium">Commande</th>
        <th class="px-3 py-2 text-right font-medium">Total TTC</th>
        <th class="px-3 py-2 font-medium">État</th>
        <th class="px-3 py-2 text-right font-medium">Date</th>
        <th class="px-3 py-2 text-right font-medium">PDF</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each data.invoices as f (f.id)}
        <!-- Toute la ligne ouvre le document ; la case et les liens restent à eux. -->
        <tr class="cursor-pointer hover:bg-muted/30 {coches.has(f.id) ? 'bg-muted/40' : ''}" onclick={(e) => { if (!(e.target as HTMLElement).closest('a,input,label')) goto(`/admin/factures/${f.id}`); }}>
          <td class="px-3 py-2"><input type="checkbox" checked={coches.has(f.id)} onchange={(e) => (e.currentTarget.checked ? coches.add(f.id) : coches.delete(f.id))} aria-label="Cocher {f.ref}" class="size-4" /></td>
          <td class="px-3 py-2"><a href="/admin/factures/{f.id}" class="font-medium hover:text-link">{f.status === 'draft' ? 'brouillon' : f.ref}</a></td>
          <td class="px-3 py-2">
            {#if f.kind === 'credit_note'}<span class="rounded bg-warning/15 px-2 py-0.5 text-xs text-warning">Avoir</span>{:else}<span class="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">Facture</span>{/if}
          </td>
          <td class="px-3 py-2 text-muted-foreground">{f.name || '—'}</td>
          <td class="px-3 py-2 text-muted-foreground">{#if f.order_number}<a href="/admin/commandes/{f.order_number}" class="hover:text-link">#{f.order_number}</a>{:else}—{/if}</td>
          <td class="px-3 py-2 text-right tabular-nums">{f.kind === 'credit_note' ? '−' : ''}{euros(f.total_ttc)}</td>
          <td class="px-3 py-2"><span class="whitespace-nowrap rounded px-2 py-0.5 text-xs {etat(f).cls}">{etat(f).texte}{#if f.status === 'partial'} · {euros(f.paid_total)}{/if}</span></td>
          <td class="px-3 py-2 text-right text-muted-foreground">{dateFr(f.issued_at)}</td>
          <td class="px-3 py-2 text-right"><a href="/admin/factures/{f.id}/{f.imported_from === 'meg' ? 'original' : 'pdf'}?dl=1" class="inline-flex text-muted-foreground hover:text-foreground" aria-label="Télécharger"><Download size={16} /></a></td>
        </tr>
      {/each}
      {#if data.invoices.length === 0}
        <tr><td colspan="9" class="px-3 py-10 text-center text-muted-foreground">Aucun document{filtresActifs.length || q ? ' pour ce filtre' : ' pour le moment'}.</td></tr>
      {/if}
    </tbody>
  </table>
</div>

<Pagination page={data.page} {pageCount} onpage={(p) => nav({ page: p })} />

<!-- ── Fenêtre Trier & filtrer ── -->
{#if fenetre}
  <div class="fixed inset-0 z-[60] grid place-items-center p-4">
    <button type="button" class="absolute inset-0 cursor-default bg-black/50" aria-label="Fermer" onclick={() => (fenetre = false)}></button>
    <form class="relative z-10 w-full max-w-md space-y-4 rounded-lg border border-border bg-background p-6 shadow-2xl" onsubmit={(e) => { e.preventDefault(); appliquer(); }}>
      <button type="button" onclick={() => (fenetre = false)} class="absolute right-3 top-3 grid size-8 place-items-center text-muted-foreground hover:text-foreground" aria-label="Fermer"><X size={18} /></button>
      <h3 class="text-lg font-bold">Trier &amp; filtrer</h3>
      <div class="grid grid-cols-2 gap-3">
        <label class="text-sm font-medium">Type
          <select bind:value={fKind} class="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"><option value="">Tout</option><option value="invoice">Factures</option><option value="credit_note">Avoirs</option></select>
        </label>
        <label class="text-sm font-medium">État
          <select bind:value={fStatus} class="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm">{#each ETATS as e (e.s)}<option value={e.s}>{e.label}</option>{/each}</select>
        </label>
        <label class="text-sm font-medium">Du <input type="date" bind:value={fFrom} class="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm" /></label>
        <label class="text-sm font-medium">Au <input type="date" bind:value={fTo} class="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm" /></label>
        <label class="col-span-2 text-sm font-medium">Tri
          <select bind:value={fSort} class="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm">{#each TRIS as t (t.v)}<option value={t.v}>{t.label}</option>{/each}</select>
        </label>
        <label class="text-sm font-medium">Par page
          <select bind:value={fLimit} class="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm">{#each [25, 50, 100, 200] as n (n)}<option value={n}>{n}</option>{/each}</select>
        </label>
      </div>
      <div class="flex items-center justify-between gap-2 pt-2">
        <button type="button" class="text-sm text-muted-foreground hover:text-foreground" onclick={reinitialiser}>Réinitialiser</button>
        <div class="flex gap-2">
          <Button type="button" variant="outline" onclick={() => (fenetre = false)}>Annuler</Button>
          <Button type="submit" variant="brand">Appliquer</Button>
        </div>
      </div>
    </form>
  </div>
{/if}

<!-- ── Chiffres de la sélection ── -->
{#if stats}
  <div class="fixed inset-0 z-[60] grid place-items-center p-4">
    <button type="button" class="absolute inset-0 cursor-default bg-black/50" aria-label="Fermer" onclick={() => (stats = false)}></button>
    <div class="relative z-10 w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-2xl">
      <button type="button" onclick={() => (stats = false)} class="absolute right-3 top-3 grid size-8 place-items-center text-muted-foreground hover:text-foreground" aria-label="Fermer"><X size={18} /></button>
      <h3 class="text-lg font-bold">{chiffres.n} document{chiffres.n > 1 ? 's' : ''} sélectionné{chiffres.n > 1 ? 's' : ''}</h3>
      <p class="mb-4 text-xs text-muted-foreground">Avoirs comptés en négatif ; brouillons et annulées hors montants.</p>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div class="rounded-md border border-border p-3"><div class="text-xs text-muted-foreground">Total HT</div><div class="text-lg font-bold tabular-nums">{euros(chiffres.ht)}</div></div>
        <div class="rounded-md border border-border p-3"><div class="text-xs text-muted-foreground">TVA</div><div class="text-lg font-bold tabular-nums">{euros(chiffres.tva)}</div></div>
        <div class="rounded-md border border-border p-3"><div class="text-xs text-muted-foreground">Total TTC</div><div class="text-lg font-bold tabular-nums">{euros(chiffres.ttc)}</div></div>
        <div class="rounded-md border border-border p-3"><div class="text-xs text-muted-foreground">Réglé</div><div class="text-lg font-bold tabular-nums text-success">{euros(chiffres.regle)}</div></div>
        <div class="rounded-md border border-border p-3"><div class="text-xs text-muted-foreground">Reste dû</div><div class="text-lg font-bold tabular-nums {chiffres.reste ? 'text-warning' : ''}">{euros(chiffres.reste)}</div></div>
        <div class="rounded-md border border-border p-3"><div class="text-xs text-muted-foreground">Par état</div><div class="text-sm">{#each chiffres.parEtat as [s, n] (s)}<span class="mr-2 whitespace-nowrap">{STATUT[s]?.texte ?? s} <strong>{n}</strong></span>{/each}</div></div>
      </div>
      {#if chiffres.parClient.length}
        <h4 class="eyebrow mb-1 mt-4">Par client</h4>
        <table class="w-full text-sm"><tbody class="divide-y divide-border">
          {#each chiffres.parClient as [nom, c] (nom)}<tr><td class="py-1">{nom}</td><td class="py-1 text-right text-muted-foreground">{c.n}</td><td class="py-1 text-right tabular-nums">{euros(c.ttc)}</td></tr>{/each}
        </tbody></table>
      {/if}
      <div class="mt-4 flex justify-end gap-2">
        <a href="/admin/factures/export.csv?ids={idsSelection}" class="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted"><Download size={14} /> CSV</a>
        <a href="/admin/factures/export.zip?ids={idsSelection}" class="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted"><FileZip size={14} /> ZIP des PDF</a>
        <Button type="button" variant="outline" onclick={() => (stats = false)}>Fermer</Button>
      </div>
    </div>
  </div>
{/if}
