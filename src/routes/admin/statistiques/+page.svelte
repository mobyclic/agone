<script lang="ts">
  import { goto } from '$app/navigation';
  import { euros } from '$lib/labels';
  import { ChartBar, Package, Receipt, CurrencyEur, MagnifyingGlass, CaretDown } from 'phosphor-svelte';

  let { data } = $props();

  const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
  const eur = (n: number) => euros(n) ?? '0 €';
  const eurK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')} k€` : eur(n));
  const fmtFormat = (f: string) => (f === 'epub' ? 'Numérique' : f === 'souscription' ? 'Souscription' : f === 'papier' ? 'Papier' : f);

  function nav(params: Record<string, string | number | undefined>) {
    const merged: Record<string, string | number | undefined> = { livre: data.bookSlug, annee: data.year, ...params };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== '') sp.set(k, String(v));
    const s = sp.toString();
    goto(`/admin/statistiques${s ? `?${s}` : ''}`, { keepFocus: true, noScroll: true });
  }

  // Combobox de recherche livre
  let comboOpen = $state(false);
  let comboQ = $state('');
  let comboInput = $state<HTMLInputElement | null>(null);
  const comboFiltered = $derived(
    comboQ.trim()
      ? data.books.filter((b) => b.title.toLowerCase().includes(comboQ.trim().toLowerCase()))
      : data.books
  );
  function selectBook(slug?: string) {
    comboOpen = false;
    comboQ = '';
    nav({ livre: slug });
  }
  $effect(() => {
    if (comboOpen) comboInput?.focus();
  });

  const monthMax = $derived(Math.max(1, ...data.byMonth.map((m) => m.ca)));
  const yearMax = $derived(Math.max(1, ...data.byYear.map((y) => y.ca)));
  const fmtTotal = $derived(Math.max(1, data.formats.reduce((s, f) => s + f.units, 0)));

  const cards = $derived([
    { label: "Chiffre d'affaires", value: eur(data.overview.ca), icon: CurrencyEur },
    { label: data.bookSlug ? 'Ventes' : 'Commandes', value: data.overview.orders.toLocaleString('fr-FR'), icon: Receipt },
    { label: 'Exemplaires', value: data.overview.units.toLocaleString('fr-FR'), icon: Package },
    { label: 'Panier moyen', value: eur(data.overview.aov), icon: ChartBar }
  ]);
</script>

<svelte:head><title>Statistiques · Admin Agone</title></svelte:head>

<div class="mb-5 flex flex-wrap items-end justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">Statistiques</h2>
    <p class="text-sm text-muted-foreground">Ventes encaissées (commandes payées / complétées){#if data.bookTitle} · <span class="text-link">{data.bookTitle}</span>{/if}</p>
  </div>
  <div class="flex flex-wrap gap-2">
    <!-- Combobox recherchable : filtre par livre -->
    <div class="relative">
      <button type="button" onclick={() => (comboOpen = !comboOpen)}
        class="flex h-10 w-[260px] items-center justify-between gap-2 rounded-md border border-border bg-background px-3 text-sm">
        <span class="truncate {data.bookTitle ? '' : 'text-muted-foreground'}">{data.bookTitle ?? 'Tous les livres'}</span>
        <CaretDown size={14} class="shrink-0 text-muted-foreground" />
      </button>
      {#if comboOpen}
        <button type="button" class="fixed inset-0 z-30 cursor-default" aria-label="Fermer" onclick={() => (comboOpen = false)}></button>
        <div class="absolute right-0 z-40 mt-1 w-[300px] overflow-hidden rounded-md border border-border bg-background shadow-2xl">
          <div class="border-b border-border p-2">
            <div class="relative">
              <MagnifyingGlass size={15} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input bind:this={comboInput} bind:value={comboQ} placeholder="Rechercher un livre…" autocomplete="off"
                class="h-9 w-full rounded border border-border bg-background pl-8 pr-2 text-sm outline-none focus:border-primary" />
            </div>
          </div>
          <ul class="max-h-72 overflow-y-auto py-1 text-sm">
            <li><button type="button" onclick={() => selectBook(undefined)} class="block w-full px-3 py-2 text-left hover:bg-muted/50 {data.bookSlug ? '' : 'font-medium text-link'}">Tous les livres</button></li>
            {#each comboFiltered as b (b.slug)}
              <li><button type="button" onclick={() => selectBook(b.slug)} class="block w-full truncate px-3 py-2 text-left hover:bg-muted/50 {data.bookSlug === b.slug ? 'font-medium text-link' : ''}">{b.title}</button></li>
            {/each}
            {#if comboFiltered.length === 0}<li class="px-3 py-3 text-center text-muted-foreground">Aucun livre.</li>{/if}
          </ul>
        </div>
      {/if}
    </div>
    <select value={data.year} onchange={(e) => nav({ annee: e.currentTarget.value })}
      class="h-10 rounded-md border border-border bg-background px-3 text-sm">
      {#each data.years as y (y)}<option value={y}>{y}</option>{/each}
    </select>
  </div>
</div>

<!-- Aperçu -->
<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
  {#each cards as c (c.label)}
    <div class="rounded-lg border border-border bg-card p-4">
      <div class="flex items-center justify-between">
        <span class="text-sm text-muted-foreground">{c.label}</span>
        <span class="grid size-8 place-items-center rounded-md bg-accent text-link"><c.icon size={16} /></span>
      </div>
      <div class="mt-2 text-2xl font-bold tabular-nums">{c.value}</div>
    </div>
  {/each}
</div>

<div class="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
  <!-- Graphe mensuel -->
  <div class="rounded-lg border border-border bg-card p-5">
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-base font-semibold">Ventes {data.year} par mois</h3>
      <span class="text-xs text-muted-foreground">CA</span>
    </div>
    <div class="flex h-52 items-end gap-1.5">
      {#each data.byMonth as m (m.period)}
        <div class="group relative flex flex-1 flex-col items-center justify-end">
          <div class="w-full bg-foreground transition-colors group-hover:bg-link" style="height:{Math.max(1, (m.ca / monthMax) * 100)}%"></div>
          <div class="pointer-events-none absolute bottom-full mb-1 hidden whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] text-background group-hover:block">
            {eur(m.ca)} · {m.orders} cmd
          </div>
        </div>
      {/each}
    </div>
    <div class="mt-1.5 flex gap-1.5">
      {#each MONTHS as mo (mo)}<div class="flex-1 text-center text-[10px] text-muted-foreground">{mo}</div>{/each}
    </div>
  </div>

  <!-- Formats -->
  <div class="rounded-lg border border-border bg-card p-5">
    <h3 class="mb-4 text-base font-semibold">Répartition par format ({data.year})</h3>
    {#if data.formats.length === 0}
      <p class="text-sm text-muted-foreground">Aucune vente sur cette période.</p>
    {:else}
      <div class="space-y-3">
        {#each data.formats as f (f.format)}
          <div>
            <div class="mb-1 flex items-baseline justify-between text-sm">
              <span class="font-medium">{fmtFormat(f.format)}</span>
              <span class="text-muted-foreground">{f.units} ex. · {eur(f.ca)}</span>
            </div>
            <div class="h-2 w-full bg-secondary"><div class="h-2 bg-link" style="width:{(f.units / fmtTotal) * 100}%"></div></div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- Par année -->
<div class="mt-6 rounded-lg border border-border bg-card p-5">
  <h3 class="mb-4 text-base font-semibold">Par année</h3>
  <div class="space-y-2.5">
    {#each data.byYear as y (y.period)}
      <button type="button" onclick={() => nav({ annee: y.period })}
        class="flex w-full items-center gap-4 text-left {y.period === data.year ? '' : 'opacity-70 hover:opacity-100'}">
        <span class="w-12 shrink-0 font-display text-lg font-bold tabular-nums">{y.period}</span>
        <div class="h-6 flex-1 bg-secondary">
          <div class="flex h-6 items-center bg-foreground px-2 text-xs font-medium text-background" style="width:{Math.max(6, (y.ca / yearMax) * 100)}%">{eurK(y.ca)}</div>
        </div>
        <span class="w-40 shrink-0 text-right text-sm text-muted-foreground">{y.orders} cmd · {y.units} ex.</span>
      </button>
    {/each}
    {#if data.byYear.length === 0}<p class="text-sm text-muted-foreground">Aucune vente.</p>{/if}
  </div>
</div>

<!-- Top livres -->
{#if !data.bookSlug && data.tops.length}
  <div class="mt-6 rounded-lg border border-border bg-card p-5">
    <h3 class="mb-4 text-base font-semibold">Meilleures ventes {data.year}</h3>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="border-b border-border text-left text-xs uppercase text-muted-foreground">
          <tr><th class="py-2 pr-3 font-medium">#</th><th class="py-2 pr-3 font-medium">Titre</th><th class="py-2 pr-3 text-right font-medium">Exemplaires</th><th class="py-2 text-right font-medium">CA</th></tr>
        </thead>
        <tbody class="divide-y divide-border">
          {#each data.tops as t, i (t.slug)}
            <tr class="hover:bg-muted/30">
              <td class="py-2 pr-3 tabular-nums text-muted-foreground">{i + 1}</td>
              <td class="py-2 pr-3"><button type="button" onclick={() => nav({ livre: t.slug })} class="font-medium hover:text-link">{t.title}</button></td>
              <td class="py-2 pr-3 text-right tabular-nums">{t.units}</td>
              <td class="py-2 text-right tabular-nums">{eur(t.ca)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}
