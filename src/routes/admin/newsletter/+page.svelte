<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { MagnifyingGlass, DownloadSimple, X } from 'phosphor-svelte';

  let { data } = $props();
  const pageCount = $derived(Math.max(1, Math.ceil(data.total / data.limit)));
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  const sourceLabel: Record<string, string> = { site: 'Site', page: 'Page', compte: 'Compte', checkout: 'Commande', admin: 'Admin', import: 'Import' };

  let q = $state(untrack(() => data.q ?? ''));
  let timer: ReturnType<typeof setTimeout>;
  function nav(params: Record<string, string | number | undefined>) {
    const merged: Record<string, string | number | undefined> = { q, status: data.status, page: data.page, ...params };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === '' || (k === 'page' && v === 1)) continue;
      sp.set(k, String(v));
    }
    const s = sp.toString();
    goto(`/admin/newsletter${s ? `?${s}` : ''}`, { keepFocus: true, replaceState: true, noScroll: true });
  }
  function onSearch() { clearTimeout(timer); timer = setTimeout(() => nav({ q, page: 1 }), 220); }

  const stats = $derived([
    { label: 'Abonnés actifs', value: data.stats.subscribed },
    { label: 'Désabonnés', value: data.stats.unsubscribed },
    { label: 'Total', value: data.stats.total }
  ]);
</script>

<svelte:head><title>Newsletter · Admin Agone</title></svelte:head>

<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">Newsletter</h2>
    <p class="text-sm text-muted-foreground">Liste d'abonnés, distincte des comptes clients.</p>
  </div>
  <form method="POST" action="?/seed" use:enhance>
    <Button type="submit" variant="outline" size="sm"><DownloadSimple size={15} /> Importer les clients abonnés</Button>
  </form>
</div>

<div class="mb-5 grid gap-3 sm:grid-cols-3">
  {#each stats as s (s.label)}
    <div class="rounded-lg border border-border bg-card px-4 py-3">
      <div class="text-2xl font-bold tabular-nums">{s.value}</div>
      <div class="text-xs text-muted-foreground">{s.label}</div>
    </div>
  {/each}
</div>

<div class="mb-4 flex flex-wrap gap-2">
  <div class="relative min-w-[240px] flex-1">
    <MagnifyingGlass size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input bind:value={q} oninput={onSearch} placeholder="Rechercher un e-mail…" autocomplete="off"
      class="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
  </div>
  <select value={data.status ?? ''} onchange={(e) => nav({ status: e.currentTarget.value || undefined, page: 1 })}
    class="h-10 rounded-md border border-border bg-background px-3 text-sm">
    <option value="">Tous</option>
    <option value="subscribed">Abonnés</option>
    <option value="unsubscribed">Désabonnés</option>
  </select>
</div>

<div class="overflow-x-auto rounded-lg border border-border bg-card">
  <table class="w-full text-sm">
    <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
      <tr>
        <th class="px-3 py-2 font-medium">E-mail</th>
        <th class="px-3 py-2 font-medium">Nom</th>
        <th class="px-3 py-2 font-medium">Statut</th>
        <th class="px-3 py-2 font-medium">Origine</th>
        <th class="px-3 py-2 text-right font-medium">Inscrit le</th>
        <th class="px-3 py-2"></th>
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each data.subscribers as s (s.id)}
        <tr class="hover:bg-muted/30">
          <td class="px-3 py-2">
            <span class="font-medium">{s.email}</span>
            {#if s.is_user}<span class="ml-1.5 rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">Compte</span>{/if}
          </td>
          <td class="px-3 py-2 text-muted-foreground">{[s.first_name, s.last_name].filter(Boolean).join(' ') || '—'}</td>
          <td class="px-3 py-2">
            <span class="rounded px-2 py-0.5 text-xs font-medium {s.status === 'subscribed' ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}">{s.status === 'subscribed' ? 'Abonné' : 'Désabonné'}</span>
          </td>
          <td class="px-3 py-2 text-xs text-muted-foreground">{sourceLabel[s.source] ?? s.source}</td>
          <td class="px-3 py-2 text-right text-muted-foreground">{dateFr(s.created_at)}</td>
          <td class="px-3 py-2 text-right">
            {#if s.status === 'subscribed'}
              <form method="POST" action="?/unsubscribe" use:enhance>
                <input type="hidden" name="email" value={s.email} />
                <button type="submit" class="text-muted-foreground hover:text-destructive" title="Désabonner"><X size={15} /></button>
              </form>
            {/if}
          </td>
        </tr>
      {/each}
      {#if data.subscribers.length === 0}
        <tr><td colspan="6" class="px-3 py-10 text-center text-muted-foreground">Aucun abonné.</td></tr>
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
