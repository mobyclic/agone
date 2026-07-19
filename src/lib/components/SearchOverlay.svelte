<script lang="ts">
  import { MagnifyingGlass, X, User, Article, CalendarDots } from 'phosphor-svelte';

  interface Results {
    books: { title: string; slug: string; cover_url?: string; author?: string }[];
    authors: { full_name: string; slug: string }[];
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
  const evDate = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const groupLabel = 'px-4 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';
</script>

<svelte:window onkeydown={(e) => {
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); open = true; }
  else if (e.key === 'Escape' && open) close();
}} />

{#if open}
  <div class="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[10vh] sm:pt-[12vh]" role="dialog" aria-modal="true" aria-label="Recherche">
    <button type="button" class="absolute inset-0 cursor-default bg-black/50" aria-label="Fermer" onclick={close}></button>
    <div class="relative z-10 w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-background shadow-2xl">
      <div class="flex items-center gap-3 border-b border-border px-4">
        <MagnifyingGlass size={18} class="shrink-0 text-muted-foreground" />
        <input
          bind:this={inputEl}
          bind:value={q}
          oninput={onInput}
          placeholder="Rechercher un livre, un auteur, un article, une rencontre…"
          autocomplete="off"
          class="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
        <button type="button" onclick={close} class="grid size-8 shrink-0 place-items-center text-muted-foreground hover:text-foreground" aria-label="Fermer"><X size={18} /></button>
      </div>

      <div class="max-h-[62vh] overflow-y-auto">
        {#if q.trim().length < 2}
          <p class="px-4 py-10 text-center text-sm text-muted-foreground">Tapez au moins 2 caractères.</p>
        {:else if loading && !results}
          <p class="px-4 py-10 text-center text-sm text-muted-foreground">Recherche…</p>
        {:else if !hasResults}
          <p class="px-4 py-10 text-center text-sm text-muted-foreground">Aucun résultat pour « {q.trim()} ».</p>
        {:else if results}
          {#if results.books.length}
            <div class="border-b border-border py-1.5">
              <p class={groupLabel}>Livres</p>
              {#each results.books as b (b.slug)}
                <a href="/livre/{b.slug}" onclick={close} class="flex items-center gap-3 px-4 py-2 hover:bg-muted/50">
                  <span class="h-12 w-8 shrink-0 overflow-hidden border border-border bg-muted">{#if b.cover_url}<img src={b.cover_url} alt="" class="size-full object-cover" />{/if}</span>
                  <span class="min-w-0"><span class="block truncate text-sm font-medium">{b.title}</span>{#if b.author}<span class="block truncate text-xs text-link">{b.author}</span>{/if}</span>
                </a>
              {/each}
            </div>
          {/if}
          {#if results.authors.length}
            <div class="border-b border-border py-1.5">
              <p class={groupLabel}>Auteurs</p>
              {#each results.authors as a (a.slug)}
                <a href="/auteur/{a.slug}" onclick={close} class="flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-muted/50"><User size={16} class="shrink-0 text-muted-foreground" /> <span class="truncate">{a.full_name}</span></a>
              {/each}
            </div>
          {/if}
          {#if results.articles.length}
            <div class="border-b border-border py-1.5">
              <p class={groupLabel}>Antichambre</p>
              {#each results.articles as a (a.slug)}
                <a href="/article/{a.slug}" onclick={close} class="flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-muted/50">
                  <Article size={16} class="shrink-0 text-muted-foreground" />
                  <span class="min-w-0 flex-1 truncate">{a.title}</span>
                  {#if a.rubrique}<span class="shrink-0 text-xs text-muted-foreground">{a.rubrique}</span>{/if}
                </a>
              {/each}
            </div>
          {/if}
          {#if results.events.length}
            <div class="border-b border-border py-1.5">
              <p class={groupLabel}>Rencontres</p>
              {#each results.events as e (e.slug)}
                <a href="/rencontres/{e.slug}" onclick={close} class="flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-muted/50">
                  <CalendarDots size={16} class="shrink-0 {e.upcoming ? 'text-link' : 'text-muted-foreground'}" />
                  <span class="min-w-0 flex-1 truncate">{e.title}</span>
                  <span class="shrink-0 text-xs text-muted-foreground">{evDate(e.start_at)}{e.venue_city ? ` · ${e.venue_city}` : ''}</span>
                </a>
              {/each}
            </div>
          {/if}
          <a href="/recherche?q={encodeURIComponent(q.trim())}" onclick={close} class="block px-4 py-3 text-center text-sm font-medium text-link hover:bg-muted/50">Voir tous les résultats →</a>
        {/if}
      </div>
    </div>
  </div>
{/if}
