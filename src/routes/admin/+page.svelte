<script lang="ts">
  import { ORDER_STATUS_LABEL, euros } from '$lib/labels';
  import { MagnifyingGlass, BookOpen, PenNib, Article, Plus, ArrowRight } from 'phosphor-svelte';

  let { data } = $props();
  const eur = (n: number) => euros(n) ?? '0 €';
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—');
  const asOfLabel = $derived(new Date(data.asOf).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }));

  const y = $derived(data.ytd);
  const barMax = $derived(Math.max(1, y.ca, y.prevCa));

  const catalogueStats = $derived([
    { label: 'Livres publiés', value: data.counts.books, href: '/admin/catalogue' },
    { label: 'À paraître', value: data.counts.forthcoming, href: '/admin/catalogue?status=forthcoming' },
    { label: 'Auteurs', value: data.counts.authors, href: '/admin/auteurs' },
    { label: 'Articles', value: data.counts.articles, href: '/admin/contenu' },
    { label: 'Rencontres à venir', value: data.counts.events, href: '/rencontres' }
  ]);

  const statusTone: Record<string, string> = {
    pending: 'bg-warning/15 text-warning', paid: 'bg-success/15 text-success',
    processing: 'bg-accent text-accent-foreground', sent_to_bl: 'bg-accent text-accent-foreground',
    completed: 'bg-success/15 text-success', cancelled: 'bg-muted text-muted-foreground',
    refunded: 'bg-muted text-muted-foreground', failed: 'bg-destructive/10 text-destructive'
  };

  // — Recherche rapide (livre / auteur / article → édition) —
  type Hit = { type: 'book' | 'author' | 'article'; id: string; label: string; sub?: string; href: string };
  const TYPE_META: Record<Hit['type'], { icon: any; label: string }> = {
    book: { icon: BookOpen, label: 'Livre' },
    author: { icon: PenNib, label: 'Auteur' },
    article: { icon: Article, label: 'Article' }
  };
  let q = $state('');
  let hits = $state<Hit[]>([]);
  let searching = $state(false);
  let timer: ReturnType<typeof setTimeout>;
  let ctrl: AbortController | null = null;

  function onInput() {
    clearTimeout(timer);
    const term = q.trim();
    if (term.length < 2) { hits = []; searching = false; return; }
    searching = true;
    timer = setTimeout(async () => {
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        const r = await fetch(`/admin/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        hits = r.ok ? (await r.json()).results : [];
      } catch (e) {
        if ((e as Error).name !== 'AbortError') hits = [];
      } finally {
        searching = false;
      }
    }, 200);
  }
</script>

<svelte:head><title>Tableau de bord · Admin Agone</title></svelte:head>

<div class="mb-6">
  <p class="eyebrow">Tableau de bord</p>
  <h2 class="mt-1 text-xl font-bold">Bonjour {data.user.first_name || data.user.email} 👋</h2>
</div>

<!-- Ventes + catalogue en bref -->
<div class="grid gap-4 lg:grid-cols-3">
  <!-- Ventes année en cours vs N-1 à date -->
  <section class="rounded-lg border border-border bg-card p-5 lg:col-span-2">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="eyebrow">Ventes {y.year}</p>
        <p class="text-xs text-muted-foreground">au {asOfLabel}</p>
      </div>
      <a href="/admin/statistiques" class="text-sm text-link hover:underline">Statistiques détaillées →</a>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      <div class="text-3xl font-bold tabular-nums">{eur(y.ca)}</div>
      <div class="text-sm text-muted-foreground">{y.orders.toLocaleString('fr-FR')} commande{y.orders > 1 ? 's' : ''}</div>
      {#if y.deltaPct !== null}
        <div class="rounded px-2 py-0.5 text-sm font-semibold {y.deltaPct >= 0 ? 'bg-success/15 text-success' : 'bg-destructive/10 text-destructive'}">
          {y.deltaPct >= 0 ? '▲' : '▼'} {Math.abs(y.deltaPct).toFixed(1)} % vs {y.prevYear}
        </div>
      {/if}
    </div>

    <div class="mt-4 space-y-1.5">
      <div class="flex items-center gap-3 text-sm">
        <span class="w-10 shrink-0 font-medium tabular-nums">{y.year}</span>
        <div class="h-2.5 flex-1 bg-secondary"><div class="h-2.5 bg-foreground" style="width:{(y.ca / barMax) * 100}%"></div></div>
        <span class="w-24 shrink-0 text-right tabular-nums">{eur(y.ca)}</span>
      </div>
      <div class="flex items-center gap-3 text-sm">
        <span class="w-10 shrink-0 font-medium tabular-nums text-muted-foreground">{y.prevYear}</span>
        <div class="h-2.5 flex-1 bg-secondary"><div class="h-2.5 bg-muted-foreground/40" style="width:{(y.prevCa / barMax) * 100}%"></div></div>
        <span class="w-24 shrink-0 text-right tabular-nums text-muted-foreground">{eur(y.prevCa)}</span>
      </div>
    </div>
    <p class="mt-2.5 text-xs text-muted-foreground">{y.prevYear} à la même date · {y.prevOrders.toLocaleString('fr-FR')} commandes{#if data.pending} · <a href="/admin/commandes?status=pending" class="text-link hover:underline">{data.pending} en attente</a>{/if}</p>
  </section>

  <!-- Catalogue en bref (compact) -->
  <section class="rounded-lg border border-border bg-card p-2">
    <p class="eyebrow px-3 pb-1 pt-2">Catalogue en bref</p>
    <ul class="divide-y divide-border">
      {#each catalogueStats as c (c.label)}
        <li>
          <a href={c.href} class="flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/40">
            <span class="text-sm text-muted-foreground">{c.label}</span>
            <span class="text-base font-bold tabular-nums">{c.value.toLocaleString('fr-FR')}</span>
          </a>
        </li>
      {/each}
    </ul>
  </section>
</div>

<!-- Recherche rapide + raccourcis -->
<div class="mt-4 grid gap-4 lg:grid-cols-3">
  <section class="rounded-lg border border-border bg-card p-4 lg:col-span-2">
    <p class="eyebrow mb-2">Recherche rapide</p>
    <div class="relative">
      <MagnifyingGlass size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        bind:value={q}
        oninput={onInput}
        placeholder="Livre, auteur, article… (ISBN accepté)"
        autocomplete="off"
        class="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
      />
    </div>

    {#if q.trim().length >= 2}
      <div class="mt-2 overflow-hidden rounded-md border border-border">
        {#if hits.length}
          <ul class="divide-y divide-border">
            {#each hits as h (h.type + h.id)}
              {@const Meta = TYPE_META[h.type]}
              <li>
                <a href={h.href} class="flex items-center gap-3 px-3 py-2 hover:bg-muted/40">
                  <Meta.icon size={18} class="shrink-0 text-muted-foreground" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-medium">{h.label}</span>
                    {#if h.sub}<span class="block truncate text-xs text-muted-foreground">{h.sub}</span>{/if}
                  </span>
                  <span class="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{Meta.label}</span>
                  <ArrowRight size={14} class="shrink-0 text-muted-foreground" />
                </a>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="px-3 py-4 text-center text-sm text-muted-foreground">{searching ? 'Recherche…' : 'Aucun résultat.'}</p>
        {/if}
      </div>
    {/if}
  </section>

  <!-- Raccourcis -->
  <section class="rounded-lg border border-border bg-card p-4">
    <p class="eyebrow mb-2">Raccourcis</p>
    <div class="grid gap-2">
      <a href="/admin/catalogue/nouveau" class="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:border-primary hover:bg-muted/40"><Plus size={15} /> Nouveau livre</a>
      <a href="/admin/auteurs/nouveau" class="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:border-primary hover:bg-muted/40"><Plus size={15} /> Nouvel auteur</a>
      <a href="/admin/contenu/nouveau" class="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:border-primary hover:bg-muted/40"><Plus size={15} /> Nouvel article</a>
    </div>
  </section>
</div>

<!-- Dernières commandes -->
<div class="mt-8">
  <div class="mb-3 flex items-center justify-between">
    <h3 class="text-base font-semibold">Dernières commandes</h3>
    <a href="/admin/commandes" class="text-sm text-link hover:underline">Toutes les commandes →</a>
  </div>
  <div class="overflow-x-auto rounded-lg border border-border bg-card">
    <table class="w-full text-sm">
      <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
        <tr>
          <th class="px-3 py-2 font-medium">N°</th>
          <th class="px-3 py-2 font-medium">Client</th>
          <th class="px-3 py-2 font-medium">Statut</th>
          <th class="px-3 py-2 text-right font-medium">Total</th>
          <th class="px-3 py-2 text-right font-medium">Date</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        {#each data.recentOrders as o (o.number)}
          <tr class="hover:bg-muted/30">
            <td class="px-3 py-2"><a href="/admin/commandes/{o.number}" class="font-medium hover:text-link">#{o.number}</a></td>
            <td class="px-3 py-2 text-muted-foreground">{o.customer_name || o.customer_email || o.email || 'Invité'}</td>
            <td class="px-3 py-2"><span class="rounded px-2 py-0.5 text-xs font-medium {statusTone[o.status] ?? 'bg-secondary'}">{ORDER_STATUS_LABEL[o.status] ?? o.status}</span></td>
            <td class="px-3 py-2 text-right tabular-nums">{eur(o.total)}</td>
            <td class="px-3 py-2 text-right text-muted-foreground">{dateFr(o.created_at)}</td>
          </tr>
        {/each}
        {#if data.recentOrders.length === 0}
          <tr><td colspan="5" class="px-3 py-10 text-center text-muted-foreground">Aucune commande.</td></tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>
