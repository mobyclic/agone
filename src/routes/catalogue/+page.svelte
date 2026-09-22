<script lang="ts">
  /**
   * Le catalogue complet, filtrable par facettes — tout se passe côté client sur
   * ~400 titres : chaque clic répond instantanément, compteurs compris.
   *
   * Facettes : Parutions (nouveautés / fond / à paraître / souscription),
   * Auteur (combobox), Collections, Mots-clés. Au sein d'une facette les choix
   * s'additionnent (OU) ; d'une facette à l'autre ils se combinent (ET). Le
   * compteur de chaque option tient compte des AUTRES facettes, pour qu'il dise
   * toujours combien de titres ce clic afficherait.
   */
  import { untrack } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import BookCard from '$lib/components/BookCard.svelte';
  import PageHead from '$lib/components/PageHead.svelte';
  import SearchSelect from '$lib/components/SearchSelect.svelte';
  import { colonneCollante } from '$lib/client/sticky';
  import { deburr } from '$lib/text';
  import { X, SlidersHorizontal } from 'phosphor-svelte';
  import type { CatalogueBook } from '$lib/server/catalogue';

  let { data } = $props();

  // ── Parutions : état dérivé des dates ────────────────────────────────────
  /** Fenêtre des « nouveautés » : parus depuis moins de six mois. */
  const MOIS_NOUVEAUTE = 6;
  type Parution = 'nouveautes' | 'fond' | 'a-paraitre' | 'souscription';
  const PARUTIONS: { id: Parution; label: string }[] = [
    { id: 'nouveautes', label: 'Nouveautés' },
    { id: 'fond', label: 'Fond' },
    { id: 'a-paraitre', label: 'À paraître' },
    { id: 'souscription', label: 'En souscription' }
  ];
  const maintenant = Date.now();
  const seuilNouveaute = (() => { const d = new Date(); d.setMonth(d.getMonth() - MOIS_NOUVEAUTE); return d.getTime(); })();
  function parutionsDe(b: CatalogueBook): Parution[] {
    const t = b.published_at ? new Date(b.published_at).getTime() : null;
    if (t != null && t > maintenant) {
      const souscription = b.subscription_price != null && !!b.subscription_end && new Date(b.subscription_end).getTime() >= maintenant;
      return souscription ? ['a-paraitre', 'souscription'] : ['a-paraitre'];
    }
    return t != null && t >= seuilNouveaute ? ['nouveautes'] : ['fond'];
  }
  // Pré-calculs par livre (une fois).
  const livres = $derived(
    data.books.map((b) => ({ b, parutions: parutionsDe(b), auteurs: b.authors.map((a) => a.slug), mots: b.keywords }))
  );

  // ── État des filtres (initialisé depuis l'URL) ───────────────────────────
  const sp = untrack(() => page.url.searchParams);
  const liste = (k: string) => (sp.get(k) ?? '').split(',').filter(Boolean);
  let parutions = $state<string[]>(liste('parution'));
  let collections = $state<string[]>(liste('collection'));
  let mots = $state<string[]>(liste('mot'));
  let auteur = $state<string | null>(sp.get('auteur') || null);
  let tri = $state<'recent' | 'ancien' | 'titre' | 'auteur'>((sp.get('tri') as any) || 'recent');
  let filtresOuverts = $state(false);

  type Livre = (typeof livres)[number];
  const tests = {
    parution: (l: Livre) => !parutions.length || l.parutions.some((p) => parutions.includes(p)),
    collection: (l: Livre) => !collections.length || (!!l.b.collection && collections.includes(l.b.collection.slug)),
    mot: (l: Livre) => !mots.length || l.mots.some((m) => mots.includes(m)),
    auteur: (l: Livre) => !auteur || l.auteurs.includes(auteur)
  };
  type Facette = keyof typeof tests;
  /** Livres passant tous les filtres SAUF celui de `sauf` (base des compteurs de cette facette). */
  const sans = (sauf: Facette | null) =>
    livres.filter((l) => (Object.keys(tests) as Facette[]).every((k) => k === sauf || tests[k](l)));

  const resultats = $derived.by(() => {
    const r = sans(null);
    const nom = (l: Livre) => deburr(l.b.authors[0]?.last_name || l.b.authors[0]?.name || '~');
    const date = (l: Livre) => (l.b.published_at ? new Date(l.b.published_at).getTime() : 0);
    return [...r].sort((x, y) =>
      tri === 'titre' ? x.b.title.localeCompare(y.b.title, 'fr')
      : tri === 'auteur' ? nom(x).localeCompare(nom(y), 'fr') || x.b.title.localeCompare(y.b.title, 'fr')
      : tri === 'ancien' ? date(x) - date(y)
      : date(y) - date(x)
    );
  });

  // Compteurs par option.
  const compteParution = $derived.by(() => {
    const n: Record<string, number> = {};
    for (const l of sans('parution')) for (const p of l.parutions) n[p] = (n[p] ?? 0) + 1;
    return n;
  });
  const optionsCollections = $derived.by(() => {
    const n = new Map<string, { slug: string; name: string; n: number }>();
    // Toutes les collections du catalogue, même à 0 dans la sélection courante.
    for (const l of livres) if (l.b.collection && !n.has(l.b.collection.slug)) n.set(l.b.collection.slug, { ...l.b.collection, n: 0 });
    for (const l of sans('collection')) if (l.b.collection) n.get(l.b.collection.slug)!.n++;
    const ordre = data.collectionOrder;
    return [...n.values()].sort((a, b) => (ordre.indexOf(a.slug) + 1 || 999) - (ordre.indexOf(b.slug) + 1 || 999));
  });
  const optionsMots = $derived.by(() => {
    const n = new Map<string, number>();
    for (const l of livres) for (const m of l.mots) if (!n.has(m)) n.set(m, 0);
    for (const l of sans('mot')) for (const m of l.mots) n.set(m, (n.get(m) ?? 0) + 1);
    return [...n.entries()].map(([m, c]) => ({ m, n: c })).sort((a, b) => b.n - a.n || a.m.localeCompare(b.m, 'fr'));
  });
  let tousLesMots = $state(false);
  const optionsAuteurs = $derived.by(() => {
    const n = new Map<string, { id: string; label: string; cle: string; c: number }>();
    for (const l of sans('auteur'))
      for (const a of l.b.authors) {
        const e = n.get(a.slug) ?? { id: a.slug, label: a.name, cle: deburr(`${a.last_name ?? a.name} ${a.first_name ?? ''}`), c: 0 };
        e.c++;
        n.set(a.slug, e);
      }
    return [...n.values()]
      .sort((a, b) => a.cle.localeCompare(b.cle, 'fr'))
      .map((e) => ({ id: e.id, label: e.label, hint: String(e.c) }));
  });
  const auteurChoisi = $derived.by(() => {
    if (!auteur) return null;
    for (const l of livres) for (const a of l.b.authors) if (a.slug === auteur) return { id: a.slug, label: a.name };
    return { id: auteur, label: auteur };
  });

  const actifs = $derived(parutions.length + collections.length + mots.length + (auteur ? 1 : 0));
  function toutEffacer() { parutions = []; collections = []; mots = []; auteur = null; }
  const bascule = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  // ── URL ↔ état ───────────────────────────────────────────────────────────
  $effect(() => {
    const p = new URLSearchParams();
    if (parutions.length) p.set('parution', parutions.join(','));
    if (collections.length) p.set('collection', collections.join(','));
    if (mots.length) p.set('mot', mots.join(','));
    if (auteur) p.set('auteur', auteur);
    if (tri !== 'recent') p.set('tri', tri);
    const s = p.toString();
    untrack(() => { try { replaceState(`/catalogue${s ? `?${s}` : ''}`, {}); } catch { /* routeur pas prêt */ } });
  });

  // ── Affichage progressif : 48 couvertures, puis 48 de plus à l'approche du bas ─
  const PAS = 48;
  let affiches = $state(PAS);
  $effect(() => { void resultats; affiches = PAS; });
  let sentinelle = $state<HTMLDivElement>();
  $effect(() => {
    // Réobservé à chaque lot : si la sentinelle est encore visible après ajout
    // (grand écran), l'observation initiale redéclenche aussitôt le lot suivant.
    void affiches;
    if (!sentinelle) return;
    const io = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) affiches += PAS; }, { rootMargin: '800px' });
    io.observe(sentinelle);
    return () => io.disconnect();
  });

  const nomCollection = (slug: string) => optionsCollections.find((c) => c.slug === slug)?.name ?? slug;
  const titreFacette = 'mb-2.5 font-display text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground';
</script>

<svelte:head><title>Catalogue · Agone</title></svelte:head>

<PageHead title="Le catalogue" />

{#snippet case_(coche: boolean, texte: string, n: number, onclick: () => void)}
  <li>
    <button type="button" {onclick} aria-pressed={coche}
      class="group flex w-full items-center gap-2.5 py-1 text-left {n === 0 && !coche ? 'opacity-40' : ''}">
      <span class="grid size-4 shrink-0 place-items-center border {coche ? 'border-foreground bg-foreground text-background' : 'border-border group-hover:border-foreground'}">
        {#if coche}<svg viewBox="0 0 12 12" class="size-3" aria-hidden="true"><path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" stroke-width="1.8" /></svg>{/if}
      </span>
      <span class="min-w-0 flex-1 leading-snug {coche ? 'font-semibold' : ''} group-hover:text-link">{texte}</span>
      <span class="shrink-0 text-xs tabular-nums text-muted-foreground">{n}</span>
    </button>
  </li>
{/snippet}

<section class="py-10" style="padding-inline: var(--page-gutter)">
  <div class="grid gap-y-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start" style="column-gap: var(--page-gutter)">
    <!-- Facettes -->
    <aside use:colonneCollante>
      <button type="button" onclick={() => (filtresOuverts = !filtresOuverts)} aria-expanded={filtresOuverts}
        class="flex w-full items-center justify-between border border-border px-4 py-2.5 font-display text-sm font-semibold uppercase tracking-wide lg:hidden">
        <span class="inline-flex items-center gap-2"><SlidersHorizontal size={16} /> Filtrer{actifs ? ` (${actifs})` : ''}</span>
        <span>{filtresOuverts ? '−' : '+'}</span>
      </button>

      <div class="{filtresOuverts ? 'mt-6 block' : 'hidden'} space-y-8 lg:mt-0 lg:block">
        <div>
          <p class={titreFacette}>Parutions</p>
          <ul>
            {#each PARUTIONS as p (p.id)}
              {@render case_(parutions.includes(p.id), p.label, compteParution[p.id] ?? 0, () => (parutions = bascule(parutions, p.id)))}
            {/each}
          </ul>
        </div>

        <div>
          <p class={titreFacette}>Auteur</p>
          <SearchSelect options={optionsAuteurs} value={auteurChoisi} placeholder="Nom de l’auteur…" onselect={(v) => (auteur = v?.id ?? null)} />
        </div>

        <div>
          <p class={titreFacette}>Collections</p>
          <ul>
            {#each optionsCollections as c (c.slug)}
              {@render case_(collections.includes(c.slug), c.name, c.n, () => (collections = bascule(collections, c.slug)))}
            {/each}
          </ul>
        </div>

        {#if optionsMots.length}
          <div>
            <p class={titreFacette}>Mots-clés</p>
            <ul>
              {#each tousLesMots ? optionsMots : optionsMots.slice(0, 12) as o (o.m)}
                {@render case_(mots.includes(o.m), o.m, o.n, () => (mots = bascule(mots, o.m)))}
              {/each}
            </ul>
            {#if optionsMots.length > 12}
              <button type="button" onclick={() => (tousLesMots = !tousLesMots)} class="link mt-1 text-sm">{tousLesMots ? 'Moins' : `Tous les mots-clés (${optionsMots.length})`}</button>
            {/if}
          </div>
        {/if}

        {#if actifs}
          <button type="button" onclick={toutEffacer} class="inline-flex items-center gap-1.5 font-display text-sm font-semibold uppercase tracking-wide text-link hover:underline"><X size={14} weight="bold" /> Tout effacer</button>
        {/if}
      </div>
    </aside>

    <!-- Résultats -->
    <div class="min-w-0">
      <div class="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-foreground pb-3">
        <p class="font-display text-lg font-semibold uppercase tracking-wide">
          {resultats.length} titre{resultats.length > 1 ? 's' : ''}
        </p>
        <!-- Filtres actifs, retirables un à un -->
        <div class="flex flex-1 flex-wrap gap-1.5">
          {#each parutions as p (p)}
            <button type="button" onclick={() => (parutions = bascule(parutions, p))} class="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium hover:bg-muted/70">{PARUTIONS.find((x) => x.id === p)?.label ?? p} <X size={11} /></button>
          {/each}
          {#if auteurChoisi}
            <button type="button" onclick={() => (auteur = null)} class="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium hover:bg-muted/70">{auteurChoisi.label} <X size={11} /></button>
          {/if}
          {#each collections as c (c)}
            <button type="button" onclick={() => (collections = bascule(collections, c))} class="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium hover:bg-muted/70">{nomCollection(c)} <X size={11} /></button>
          {/each}
          {#each mots as m (m)}
            <button type="button" onclick={() => (mots = bascule(mots, m))} class="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium hover:bg-muted/70">{m} <X size={11} /></button>
          {/each}
        </div>
        <label class="flex items-center gap-2 text-sm text-muted-foreground">
          Trier
          <select bind:value={tri} class="h-9 border border-border bg-background px-2 text-sm text-foreground">
            <option value="recent">Plus récents</option>
            <option value="ancien">Plus anciens</option>
            <option value="titre">Titre (A → Z)</option>
            <option value="auteur">Auteur (A → Z)</option>
          </select>
        </label>
      </div>

      {#if resultats.length}
        <div class="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {#each resultats.slice(0, affiches) as l (l.b.slug)}
            <BookCard book={l.b} />
          {/each}
        </div>
        {#if affiches < resultats.length}<div bind:this={sentinelle} class="h-px"></div>{/if}
      {:else}
        <div class="py-16 text-center">
          <p class="text-muted-foreground">Aucun titre ne correspond à ces critères.</p>
          <button type="button" onclick={toutEffacer} class="link mt-3 font-display uppercase tracking-wide">Tout effacer</button>
        </div>
      {/if}
    </div>
  </div>
</section>
