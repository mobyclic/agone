<script lang="ts">
  import { MagnifyingGlass, X, User, ArrowRight } from 'phosphor-svelte';
  import Wordmark from './Wordmark.svelte';

  interface Results {
    books: { title: string; slug: string; cover_url?: string; author?: string }[];
    authors: { full_name: string; slug: string; portrait_url?: string }[];
    articles: { title: string; slug: string; rubrique?: string }[];
    events: { title: string; slug: string; start_at?: string; venue_city?: string; upcoming: boolean }[];
  }

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let q = $state('');
  let results = $state<Results | null>(null);
  let loading = $state(false);
  let timer: ReturnType<typeof setTimeout>;
  let inputEl = $state<HTMLInputElement>();

  $effect(() => {
    if (open) {
      setTimeout(() => inputEl?.focus(), 20);
    } else {
      q = ''; results = null; loading = false;
    }
  });

  function onInput() {
    clearTimeout(timer);
    const term = q.trim();
    if (term.length < 2) { results = null; loading = false; return; }
    loading = true;
    timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        results = res.ok ? await res.json() : null;
      } catch {
        results = null;
      }
      loading = false;
    }, 200);
  }

  const hasResults = $derived(
    !!results && (results.books.length + results.authors.length + results.articles.length + results.events.length) > 0
  );
  const close = () => (open = false);
  const jour = (s?: string) => (s ? new Date(s).getDate() : '');
  const mois = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }).replace('.', '') : '');

  /** Raccourcis proposés tant que rien n'est saisi. */
  const RACCOURCIS = [
    { label: 'Catalogue', href: '/catalogue' },
    { label: 'À paraître', href: '/a-paraitre' },
    { label: 'Auteurs', href: '/auteurs' },
    { label: 'Antichambre', href: '/antichambre' },
    { label: 'Rencontres', href: '/rencontres' }
  ];
  /** Ancres vers les groupes de résultats présents. */
  const ancres = $derived(
    !results ? [] : ([
      { id: 'rech-livres', label: 'Livres', n: results.books.length },
      { id: 'rech-auteurs', label: 'Auteurs', n: results.authors.length },
      { id: 'rech-antichambre', label: 'Antichambre', n: results.articles.length },
      { id: 'rech-rencontres', label: 'Rencontres', n: results.events.length }
    ].filter((a) => a.n > 0))
  );
  let scrollEl = $state<HTMLDivElement>();
  function aller(id: string) {
    const cible = document.getElementById(id);
    if (cible && scrollEl) scrollEl.scrollTo({ top: cible.offsetTop - scrollEl.offsetTop, behavior: 'smooth' });
  }
  const ligne = 'group -mx-3 flex items-center gap-4 px-3 py-2.5 transition-colors hover:bg-muted/60';
  const titre = 'block font-medium leading-snug decoration-1 underline-offset-4 group-hover:underline';
</script>

<svelte:window onkeydown={(e) => {
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); open = true; }
  else if (e.key === 'Escape' && open) close();
}} />

{#if open}
  <div class="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[7vh] sm:pt-[9vh]" role="dialog" aria-modal="true" aria-label="Recherche">
    <button type="button" class="absolute inset-0 cursor-default bg-black/60 backdrop-blur-[2px]" aria-label="Fermer" onclick={close}></button>
    <div class="relative z-10 flex w-full max-w-2xl flex-col overflow-hidden bg-background shadow-2xl" style="max-height: 84vh">
      <!-- Bandeau noir : logo, fermeture -->
      <div class="flex items-center justify-between bg-foreground px-6 py-3 text-background">
        <span class="inline-flex" aria-hidden="true"><Wordmark class="text-[1.55rem]" /></span>
        <button type="button" onclick={close} class="inline-flex items-center gap-2 font-display text-xs uppercase tracking-wide text-background/70 transition-colors hover:text-background" aria-label="Fermer la recherche">
          <span class="hidden sm:inline">Fermer</span><X size={18} />
        </button>
      </div>

      <!-- Champ de recherche -->
      <div class="flex items-center gap-4 border-b border-border px-6">
        <MagnifyingGlass size={22} class="shrink-0 text-link" />
        <input
          bind:this={inputEl}
          bind:value={q}
          oninput={onInput}
          placeholder="Un livre, un auteur, un texte, une rencontre…"
          autocomplete="off"
          class="h-16 flex-1 bg-transparent text-lg outline-none placeholder:text-muted-foreground/70"
        />
        {#if q}
          <button type="button" onclick={() => { q = ''; results = null; inputEl?.focus(); }} class="font-display text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground">Effacer</button>
        {/if}
      </div>

      <div bind:this={scrollEl} class="relative min-h-0 flex-1 overflow-y-auto">
        {#if q.trim().length < 2}
          <!-- Rien de saisi : où aller directement -->
          <div class="px-6 py-7">
            <p class="max-w-md text-sm leading-relaxed text-muted-foreground">
              Cherchez parmi les livres, les autrices et auteurs, les textes de l’Antichambre et les rencontres à venir.
              Deux lettres suffisent pour commencer.
            </p>
            <p class="tick-label mb-3 mt-7 text-xs">Aller directement</p>
            <div class="flex flex-wrap gap-2">
              {#each RACCOURCIS as r (r.href)}
                <a href={r.href} onclick={close} class="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 font-display text-sm uppercase tracking-wide transition-colors hover:border-foreground hover:bg-foreground hover:text-background">{r.label}</a>
              {/each}
            </div>
          </div>
        {:else if loading && !results}
          <p class="px-6 py-12 text-center text-sm text-muted-foreground">Recherche…</p>
        {:else if !hasResults}
          <div class="px-6 py-10 text-center">
            <p class="text-sm text-muted-foreground">Aucun résultat pour « {q.trim()} ».</p>
            <a href="/recherche?q={encodeURIComponent(q.trim())}" onclick={close} class="mt-3 inline-block text-sm text-link underline-offset-4 hover:underline">Chercher aussi dans les textes →</a>
          </div>
        {:else if results}
          <!-- Ancres vers les groupes présents -->
          {#if ancres.length > 1}
            <div class="sticky top-0 z-10 flex flex-wrap gap-x-5 gap-y-1 border-b border-border bg-background/95 px-6 py-2.5 backdrop-blur">
              {#each ancres as a (a.id)}
                <button type="button" onclick={() => aller(a.id)} class="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground">
                  {a.label} <span class="ml-0.5 text-link">{a.n}</span>
                </button>
              {/each}
            </div>
          {/if}

          {#if results.books.length}
            <section id="rech-livres" class="px-6 pb-3 pt-5">
              <h3 class="tick-label mb-2 text-xs">Livres</h3>
              {#each results.books as b (b.slug)}
                <a href="/livre/{b.slug}" onclick={close} class={ligne}>
                  <span class="h-16 w-11 shrink-0 overflow-hidden border border-border bg-muted">{#if b.cover_url}<img src={b.cover_url} alt="" class="size-full object-cover" />{/if}</span>
                  <span class="min-w-0 flex-1">
                    <span class={titre}>{b.title}</span>
                    {#if b.author}<span class="mt-0.5 block text-sm text-link">{b.author}</span>{/if}
                  </span>
                  <ArrowRight size={16} class="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </a>
              {/each}
            </section>
          {/if}
          {#if results.authors.length}
            <section id="rech-auteurs" class="border-t border-border px-6 pb-3 pt-5">
              <h3 class="tick-label mb-2 text-xs">Autrices & auteurs</h3>
              {#each results.authors as a (a.slug)}
                <a href="/auteur/{a.slug}" onclick={close} class={ligne}>
                  <span class="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-muted text-muted-foreground">
                    {#if a.portrait_url}<img src={a.portrait_url} alt="" class="size-full object-cover" />{:else}<User size={18} />{/if}
                  </span>
                  <span class="min-w-0 flex-1 {titre}">{a.full_name}</span>
                  <ArrowRight size={16} class="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </a>
              {/each}
            </section>
          {/if}
          {#if results.articles.length}
            <section id="rech-antichambre" class="border-t border-border px-6 pb-3 pt-5">
              <h3 class="tick-label mb-2 text-xs">Antichambre</h3>
              {#each results.articles as a (a.slug)}
                <a href="/article/{a.slug}" onclick={close} class={ligne}>
                  <span class="min-w-0 flex-1">
                    {#if a.rubrique}<span class="block font-display text-[11px] font-semibold uppercase tracking-wide text-link">{a.rubrique}</span>{/if}
                    <span class={titre}>{a.title}</span>
                  </span>
                  <ArrowRight size={16} class="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </a>
              {/each}
            </section>
          {/if}
          {#if results.events.length}
            <section id="rech-rencontres" class="border-t border-border px-6 pb-3 pt-5">
              <h3 class="tick-label mb-2 text-xs">Rencontres à venir</h3>
              {#each results.events as e (e.slug)}
                <a href="/rencontres/{e.slug}" onclick={close} class={ligne}>
                  <span class="flex w-11 shrink-0 flex-col font-display leading-none">
                    <span class="text-2xl font-bold text-link">{jour(e.start_at)}</span>
                    <span class="mt-1 text-[10px] uppercase text-muted-foreground">{mois(e.start_at)}</span>
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class={titre}>{e.title}</span>
                    {#if e.venue_city}<span class="mt-0.5 block text-sm text-muted-foreground">{e.venue_city}</span>{/if}
                  </span>
                  <ArrowRight size={16} class="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </a>
              {/each}
            </section>
          {/if}
        {/if}
      </div>

      {#if hasResults}
        <a href="/recherche?q={encodeURIComponent(q.trim())}" onclick={close} class="flex items-center justify-center gap-2 border-t border-border bg-muted/40 px-6 py-3.5 font-display text-sm font-semibold uppercase tracking-wide transition-colors hover:bg-foreground hover:text-background">
          Voir tous les résultats <ArrowRight size={16} />
        </a>
      {/if}
    </div>
  </div>
{/if}
