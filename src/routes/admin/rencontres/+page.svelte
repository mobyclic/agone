<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import { Plus, MagnifyingGlass, MapPin } from 'phosphor-svelte';

  let { data } = $props();
  const pageCount = $derived(Math.max(1, Math.ceil(data.total / data.limit)));
  const WHENS = [
    { k: 'upcoming', label: 'À venir' },
    { k: 'past', label: 'Passées' },
    { k: 'all', label: 'Toutes' }
  ];
  const dateFr = (s?: string) =>
    s ? new Date(s).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const timeFr = (s?: string) => (s ? new Date(s).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '');

  let q = $state(untrack(() => data.q ?? ''));
  let timer: ReturnType<typeof setTimeout>;

  function nav(params: Record<string, string | number | undefined>) {
    const merged: Record<string, string | number | undefined> = { q, when: data.when, page: data.page, ...params };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === '' || (k === 'when' && v === 'upcoming') || (k === 'page' && v === 1)) continue;
      sp.set(k, String(v));
    }
    const s = sp.toString();
    goto(`/admin/rencontres${s ? `?${s}` : ''}`, { keepFocus: true, replaceState: true, noScroll: true });
  }
  function onSearch() {
    clearTimeout(timer);
    timer = setTimeout(() => nav({ q, page: 1 }), 220);
  }
</script>

<svelte:head><title>Rencontres · Admin Agone</title></svelte:head>

<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">Rencontres</h2>
    <p class="text-sm text-muted-foreground">{data.total} rencontre{data.total > 1 ? 's' : ''}</p>
  </div>
  <Button href="/admin/rencontres/nouvelle"><Plus size={16} /> Nouvelle rencontre</Button>
</div>

<div class="mb-4 flex flex-wrap gap-2">
  <div class="relative min-w-[240px] flex-1">
    <MagnifyingGlass size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input bind:value={q} oninput={onSearch} placeholder="Rechercher une rencontre…" autocomplete="off"
      class="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
  </div>
  <div class="flex overflow-hidden rounded-md border border-border">
    {#each WHENS as w (w.k)}
      <button type="button" class="px-3 py-2 text-sm {data.when === w.k ? 'bg-foreground text-background' : 'hover:bg-muted'}" onclick={() => nav({ when: w.k, page: 1 })}>{w.label}</button>
    {/each}
  </div>
</div>

<div class="overflow-x-auto rounded-lg border border-border bg-card">
  <table class="w-full text-sm">
    <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
      <tr>
        <th class="px-3 py-2 font-medium">Date</th>
        <th class="px-3 py-2 font-medium">Rencontre</th>
        <th class="px-3 py-2 font-medium">Lieu</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each data.events as e (e.id)}
        <tr class="hover:bg-muted/30">
          <td class="whitespace-nowrap px-3 py-2 text-muted-foreground">
            {dateFr(e.start_at)}{#if timeFr(e.start_at)}<span class="block text-xs">{timeFr(e.start_at)}</span>{/if}
          </td>
          <td class="px-3 py-2"><a href="/admin/rencontres/{e.id}" class="font-medium hover:text-link">{e.title}</a></td>
          <td class="px-3 py-2 text-muted-foreground">
            {#if e.venue_name}<MapPin size={12} class="mb-0.5 mr-0.5 inline" />{e.venue_name}{e.venue_city ? `, ${e.venue_city}` : ''}{:else}—{/if}
          </td>
        </tr>
      {/each}
      {#if data.events.length === 0}
        <tr><td colspan="3" class="px-3 py-10 text-center text-muted-foreground">Aucune rencontre.</td></tr>
      {/if}
    </tbody>
  </table>
</div>

{#if pageCount > 1}
  <div class="mt-6 flex items-center justify-center gap-2 text-sm">
    {#if data.page > 1}<button type="button" onclick={() => nav({ page: data.page - 1 })} class="rounded-md border border-border px-3 py-2 hover:bg-muted">←</button>{/if}
    <span class="px-3 py-2 text-muted-foreground">Page {data.page} / {pageCount}</span>
    {#if data.page < pageCount}<button type="button" onclick={() => nav({ page: data.page + 1 })} class="rounded-md border border-border px-3 py-2 hover:bg-muted">→</button>{/if}
  </div>
{/if}
