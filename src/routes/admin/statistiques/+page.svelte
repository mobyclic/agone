<script lang="ts">
  /**
   * Statistiques par canal. Tout se calcule ici, à partir des points de la
   * source unifiée, sur les canaux cochés : indicateurs, années empilées, mois
   * empilés, formats, classement des titres. Une couleur par canal, partout.
   */
  import { goto } from '$app/navigation';
  import { euros } from '$lib/labels';
  import { ChartBar, Package, Receipt, CurrencyEur, MagnifyingGlass, CaretDown, Info } from 'phosphor-svelte';

  let { data } = $props();

  const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
  const eur = (n: number) => euros(n) ?? '0 €';
  const eurK = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')} k€` : eur(n));
  const nb = (n: number) => Math.round(n).toLocaleString('fr-FR');

  function nav(params: Record<string, string | number | undefined>) {
    const merged: Record<string, string | number | undefined> = { livre: data.bookSlug, annee: data.year, canaux: data.selection.join(','), ...params };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== '') sp.set(k, String(v));
    const s = sp.toString();
    goto(`/admin/statistiques${s ? `?${s}` : ''}`, { keepFocus: true, noScroll: true });
  }

  // ── Canaux cochés ──────────────────────────────────────────────────────
  const coche = $derived(new Set(data.selection));
  const seriesActives = $derived(data.series.filter((s) => coche.has(s.key)));
  const couleur = $derived(Object.fromEntries(data.series.map((s) => [s.key, s.color])));
  const nomSerie = $derived(Object.fromEntries(data.series.map((s) => [s.key, s.nom])));
  function basculer(key: string) {
    const next = new Set(coche);
    if (next.has(key)) next.delete(key); else next.add(key);
    nav({ canaux: [...next].join(',') || '-' });
  }
  const toutCocher = (oui: boolean) => nav({ canaux: oui ? data.series.map((s) => s.key).join(',') : '-' });

  // ── Indicateurs de l'année ─────────────────────────────────────────────
  type Mesure = 'ca' | 'units';
  let mesure = $state<Mesure>('ca');
  const pointsAnnee = $derived(data.annee.points.filter((p) => coche.has(p.key)));
  const totaux = $derived.by(() => {
    const t = { ca: 0, units: 0, orders: 0 };
    for (const p of pointsAnnee) { t.ca += p.ca; t.units += p.units; t.orders += p.orders; }
    return t;
  });
  /** Répartition par canal d'une mesure, pour les barres colorées sous chaque indicateur. */
  const parCanal = (champ: 'ca' | 'units' | 'orders') => {
    const m = new Map<string, number>();
    for (const p of pointsAnnee) m.set(p.key, (m.get(p.key) ?? 0) + p[champ]);
    return seriesActives.map((s) => ({ key: s.key, nom: s.nom, color: s.color, v: m.get(s.key) ?? 0 })).filter((x) => x.v);
  };
  /** Le panier moyen n'a de sens que sur les canaux de commandes (la librairie n'a pas de « commande »). */
  const codesCommandes = $derived(new Set(data.tout.filter((p) => p.orders > 0).map((p) => p.key.split(':')[0])));
  const caCommandes = $derived(pointsAnnee.filter((p) => codesCommandes.has(p.key.split(':')[0])).reduce((a, p) => a + p.ca, 0));
  const cartes = $derived([
    { label: 'Chiffre d’affaires', valeur: eur(totaux.ca), icon: CurrencyEur, parts: parCanal('ca'), fmt: eurK },
    { label: 'Exemplaires', valeur: nb(totaux.units), icon: Package, parts: parCanal('units'), fmt: nb },
    { label: 'Commandes', valeur: nb(totaux.orders), icon: Receipt, parts: parCanal('orders'), fmt: nb, note: 'canaux de commandes seulement' },
    { label: 'Panier moyen', valeur: totaux.orders ? eur(caCommandes / totaux.orders) : '—', icon: ChartBar, parts: [], fmt: eur, note: 'sur les commandes' }
  ]);

  // ── Années empilées ────────────────────────────────────────────────────
  let aDate = $state(false);
  const moisCourant = $derived(new Date(data.jour).getUTCMonth() + 1);
  const parAnnee = $derived.by(() => {
    const m = new Map<number, Record<string, number>>();
    for (const p of data.tout) {
      if (!coche.has(p.key)) continue;
      if (aDate && p.mois > moisCourant) continue;
      const r = m.get(p.annee) ?? {};
      r[p.key] = (r[p.key] ?? 0) + p[mesure];
      m.set(p.annee, r);
    }
    return [...m.entries()].sort((a, b) => b[0] - a[0]).map(([annee, v]) => ({ annee, v, total: Object.values(v).reduce((a, b) => a + b, 0) }));
  });
  const anneeMax = $derived(Math.max(1, ...parAnnee.map((a) => a.total)));

  // ── Mois empilés ───────────────────────────────────────────────────────
  const parMois = $derived.by(() =>
    Array.from({ length: 12 }, (_, i) => {
      const v: Record<string, number> = {};
      for (const p of pointsAnnee) if (p.mois === i + 1) v[p.key] = (v[p.key] ?? 0) + p[mesure];
      return { mois: i + 1, v, total: Object.values(v).reduce((a, b) => a + b, 0) };
    })
  );
  const moisMax = $derived(Math.max(1, ...parMois.map((m) => m.total)));
  const nonVentile = $derived(pointsAnnee.filter((p) => p.mois === 0).reduce((a, p) => a + p[mesure], 0));

  // ── Formats et titres ──────────────────────────────────────────────────
  const formats = $derived.by(() => {
    const m: Record<'paper' | 'ebook', number> = { paper: 0, ebook: 0 };
    for (const f of data.annee.formats) if (coche.has(f.key)) m[f.format] += f[mesure];
    return m;
  });
  const tops = $derived.by(() => {
    const m = new Map<string, { title: string; slug: string; total: number; parts: Record<string, number> }>();
    for (const l of data.annee.livres) {
      if (!coche.has(l.key)) continue;
      const e = m.get(l.book) ?? { title: l.title, slug: l.slug, total: 0, parts: {} };
      e.total += l[mesure]; e.parts[l.key] = (e.parts[l.key] ?? 0) + l[mesure];
      m.set(l.book, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total).slice(0, 12);
  });
  const topMax = $derived(Math.max(1, ...tops.map((t) => t.total)));
  const fmtMesure = (n: number) => (mesure === 'ca' ? eurK(n) : `${nb(n)} ex.`);

  // Combobox de recherche livre
  let comboOpen = $state(false);
  let comboQ = $state('');
  let comboInput = $state<HTMLInputElement | null>(null);
  const comboFiltered = $derived(comboQ.trim() ? data.books.filter((b) => b.title.toLowerCase().includes(comboQ.trim().toLowerCase())) : data.books);
  function selectBook(slug?: string) { comboOpen = false; comboQ = ''; nav({ livre: slug }); }
  $effect(() => { if (comboOpen) comboInput?.focus(); });

  const onglet = (actif: boolean) =>
    `rounded-full border px-3 py-1 text-xs ${actif ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-primary hover:text-foreground'}`;
</script>

<svelte:head><title>Statistiques · Admin Agone</title></svelte:head>

<div class="mb-4 flex flex-wrap items-end justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">Statistiques</h2>
    <p class="text-sm text-muted-foreground">Ventes par canal — commandes du site, librairie, relevés importés{#if data.bookTitle} · <span class="text-link">{data.bookTitle}</span>{/if}</p>
  </div>
  <div class="flex flex-wrap gap-2">
    <div class="relative">
      <button type="button" onclick={() => (comboOpen = !comboOpen)} class="flex h-10 w-[260px] items-center justify-between gap-2 rounded-md border border-border bg-background px-3 text-sm">
        <span class="truncate {data.bookTitle ? '' : 'text-muted-foreground'}">{data.bookTitle ?? 'Tous les livres'}</span>
        <CaretDown size={14} class="shrink-0 text-muted-foreground" />
      </button>
      {#if comboOpen}
        <button type="button" class="fixed inset-0 z-30 cursor-default" aria-label="Fermer" onclick={() => (comboOpen = false)}></button>
        <div class="absolute right-0 z-40 mt-1 w-[300px] overflow-hidden rounded-md border border-border bg-background shadow-2xl">
          <div class="border-b border-border p-2">
            <div class="relative">
              <MagnifyingGlass size={15} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input bind:this={comboInput} bind:value={comboQ} placeholder="Rechercher un livre…" autocomplete="off" class="h-9 w-full rounded border border-border bg-background pl-8 pr-2 text-sm outline-none focus:border-primary" />
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
    <select value={data.year} onchange={(e) => nav({ annee: e.currentTarget.value })} class="h-10 rounded-md border border-border bg-background px-3 text-sm">
      {#each data.years as y (y)}<option value={y}>{y}</option>{/each}
    </select>
    <div class="flex overflow-hidden rounded-md border border-border bg-background text-sm">
      <button type="button" class="px-3 {mesure === 'ca' ? 'bg-foreground text-background' : 'hover:bg-muted'}" onclick={() => (mesure = 'ca')}>€</button>
      <button type="button" class="px-3 {mesure === 'units' ? 'bg-foreground text-background' : 'hover:bg-muted'}" onclick={() => (mesure = 'units')}>Ex.</button>
    </div>
  </div>
</div>

<!-- ── Canaux : cases à cocher, une couleur chacune ─────────────────────── -->
<div class="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-4 py-3">
  <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Canaux</span>
  {#each data.series as s (s.key)}
    <label class="inline-flex cursor-pointer items-center gap-1.5 text-sm">
      <input type="checkbox" checked={coche.has(s.key)} onchange={() => basculer(s.key)} class="size-4 rounded border-border" style="accent-color:{s.color}" />
      <span class="inline-block size-3 rounded-sm" style="background:{s.color}"></span>
      {s.nom}
      <span class="text-xs text-muted-foreground">{s.family === 'direct' ? 'direct' : 'indirect'}</span>
    </label>
  {/each}
  <span class="ml-auto flex gap-2 text-xs">
    <button type="button" class="text-link hover:underline" onclick={() => toutCocher(true)}>tout</button>
    <button type="button" class="text-link hover:underline" onclick={() => toutCocher(false)}>rien</button>
    <a href="/admin/canaux" class="text-muted-foreground hover:underline">gérer les canaux</a>
  </span>
</div>

<!-- ── Indicateurs de l'année, avec la part de chaque canal ────────────── -->
<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
  {#each cartes as c (c.label)}
    <div class="rounded-lg border border-border bg-card p-4">
      <div class="flex items-center justify-between">
        <span class="text-sm text-muted-foreground">{c.label} {data.year}</span>
        <span class="grid size-8 place-items-center rounded-md bg-accent text-link"><c.icon size={16} /></span>
      </div>
      <div class="mt-2 text-2xl font-bold tabular-nums">{c.valeur}</div>
      {#if c.parts.length}
        {@const tot = c.parts.reduce((a, p) => a + p.v, 0)}
        <div class="mt-2 flex h-1.5 w-full overflow-hidden rounded bg-muted">
          {#each c.parts as p (p.key)}<div style="width:{(p.v / tot) * 100}%;background:{p.color}" title="{p.nom} : {c.fmt(p.v)}"></div>{/each}
        </div>
        <div class="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {#each c.parts as p (p.key)}<span class="inline-flex items-center gap-1"><span class="inline-block size-2 rounded-sm" style="background:{p.color}"></span>{c.fmt(p.v)}</span>{/each}
        </div>
      {:else if c.note}
        <div class="mt-2 text-[11px] text-muted-foreground">{c.note}</div>
      {/if}
    </div>
  {/each}
</div>

<!-- ── Par année, empilé par canal ──────────────────────────────────────── -->
<div class="mt-6 rounded-lg border border-border bg-card p-5">
  <div class="mb-4 flex flex-wrap items-baseline justify-between gap-3">
    <h3 class="text-base font-semibold">Par année — {mesure === 'ca' ? 'chiffre d’affaires' : 'exemplaires'}</h3>
    <div class="flex gap-1.5">
      <button type="button" class={onglet(!aDate)} onclick={() => (aDate = false)}>Année complète</button>
      <button type="button" class={onglet(aDate)} onclick={() => (aDate = true)}>À date (fin {MONTHS[moisCourant - 1]})</button>
    </div>
  </div>
  <div class="space-y-2.5">
    {#each parAnnee as a (a.annee)}
      <button type="button" onclick={() => nav({ annee: a.annee })} class="flex w-full items-center gap-4 text-left {a.annee === data.year ? '' : 'opacity-75 hover:opacity-100'}">
        <span class="w-12 shrink-0 font-display text-lg font-bold tabular-nums">{a.annee}</span>
        <div class="flex h-6 flex-1 overflow-hidden bg-secondary">
          {#each seriesActives as s (s.key)}
            {#if a.v[s.key]}<div class="h-6" style="width:{(a.v[s.key] / anneeMax) * 100}%;background:{s.color}" title="{s.nom} : {fmtMesure(a.v[s.key])}"></div>{/if}
          {/each}
        </div>
        <span class="w-24 shrink-0 text-right text-sm font-medium tabular-nums">{fmtMesure(a.total)}</span>
      </button>
    {/each}
    {#if parAnnee.length === 0}<p class="text-sm text-muted-foreground">Rien pour ces canaux.</p>{/if}
  </div>
  {#if aDate}
    <p class="mt-3 text-xs text-muted-foreground">Chaque année arrêtée à fin {MONTHS[moisCourant - 1]}, au mois près, pour comparer avec l’année en cours.</p>
  {/if}
</div>

<div class="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
  <!-- ── Par mois, empilé ─────────────────────────────────────────────────── -->
  <div class="rounded-lg border border-border bg-card p-5">
    <h3 class="mb-4 text-base font-semibold">{data.year} par mois — {mesure === 'ca' ? 'chiffre d’affaires' : 'exemplaires'}</h3>
    <div class="flex h-52 items-end gap-1.5">
      {#each parMois as m (m.mois)}
        <div class="group relative flex h-full flex-1 flex-col items-center justify-end">
          {#each seriesActives as s (s.key)}
            {#if m.v[s.key]}<div class="w-full" style="height:{(m.v[s.key] / moisMax) * 100}%;background:{s.color}"></div>{/if}
          {/each}
          <div class="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-left text-[10px] text-background group-hover:block">
            <strong>{fmtMesure(m.total)}</strong>
            {#each seriesActives as s (s.key)}{#if m.v[s.key]}<br>{s.nom} : {fmtMesure(m.v[s.key])}{/if}{/each}
          </div>
        </div>
      {/each}
    </div>
    <div class="mt-1.5 flex gap-1.5">
      {#each MONTHS as mo (mo)}<div class="flex-1 text-center text-[10px] text-muted-foreground">{mo}</div>{/each}
    </div>
    {#if nonVentile}
      <p class="mt-2 inline-flex items-start gap-1.5 text-xs text-muted-foreground"><Info size={13} class="mt-0.5 shrink-0" />
        {fmtMesure(nonVentile)} relevés à l’année sans détail mensuel (comptés dans les totaux, pas dans la courbe). Pour la librairie, relever les mouvements mois par mois.</p>
    {/if}
  </div>

  <!-- ── Formats ─────────────────────────────────────────────────────────── -->
  <div class="rounded-lg border border-border bg-card p-5">
    <h3 class="mb-4 text-base font-semibold">Formats {data.year}</h3>
    {#each [['paper', 'Papier'], ['ebook', 'Numérique']] as [k, nom] (k)}
      {@const v = formats[k as 'paper' | 'ebook']}
      {@const tot = formats.paper + formats.ebook || 1}
      <div class="mb-3">
        <div class="mb-1 flex justify-between text-sm"><span>{nom}</span><span class="font-medium tabular-nums">{fmtMesure(v)} <span class="text-xs text-muted-foreground">({Math.round((v / tot) * 100)} %)</span></span></div>
        <div class="h-2 w-full bg-secondary"><div class="h-2 bg-foreground" style="width:{(v / tot) * 100}%"></div></div>
      </div>
    {/each}
    <p class="text-xs text-muted-foreground">Sur les canaux cochés. La librairie compte en papier.</p>
  </div>
</div>

<!-- ── Meilleures ventes, colorées par canal ────────────────────────────── -->
{#if !data.bookSlug && tops.length}
  <div class="mt-6 rounded-lg border border-border bg-card p-5">
    <h3 class="mb-4 text-base font-semibold">Meilleures ventes {data.year} — {mesure === 'ca' ? 'chiffre d’affaires' : 'exemplaires'}</h3>
    <div class="space-y-2">
      {#each tops as t, i (t.slug + i)}
        <div class="flex items-center gap-3 text-sm">
          <span class="w-5 shrink-0 text-right text-xs text-muted-foreground">{i + 1}</span>
          <a href="/admin/catalogue/{t.slug}" class="w-64 shrink-0 truncate font-medium hover:text-link" title={t.title}>{t.title}</a>
          <div class="flex h-4 flex-1 overflow-hidden bg-secondary">
            {#each seriesActives as s (s.key)}
              {#if t.parts[s.key]}<div class="h-4" style="width:{(t.parts[s.key] / topMax) * 100}%;background:{s.color}" title="{s.nom} : {fmtMesure(t.parts[s.key])}"></div>{/if}
            {/each}
          </div>
          <span class="w-20 shrink-0 text-right tabular-nums">{fmtMesure(t.total)}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}
