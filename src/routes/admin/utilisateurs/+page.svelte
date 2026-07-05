<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { MagnifyingGlass } from 'phosphor-svelte';

  let { data } = $props();
  const pageCount = $derived(Math.max(1, Math.ceil(data.total / data.limit)));
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  const roleLabel: Record<string, string> = { admin: 'Admin', editor: 'Éditeur', customer: 'Client', pending: 'En attente' };
  const roleTone: Record<string, string> = {
    admin: 'bg-foreground text-background', editor: 'bg-accent text-accent-foreground',
    customer: 'bg-secondary text-muted-foreground', pending: 'bg-warning/15 text-warning'
  };

  let q = $state(untrack(() => data.q ?? ''));
  let timer: ReturnType<typeof setTimeout>;
  function nav(params: Record<string, string | number | undefined>) {
    const merged: Record<string, string | number | undefined> = { q, role: data.role, page: data.page, ...params };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === '' || (k === 'page' && v === 1)) continue;
      sp.set(k, String(v));
    }
    const s = sp.toString();
    goto(`/admin/utilisateurs${s ? `?${s}` : ''}`, { keepFocus: true, replaceState: true, noScroll: true });
  }
  function onSearch() { clearTimeout(timer); timer = setTimeout(() => nav({ q, page: 1 }), 220); }
</script>

<svelte:head><title>Utilisateurs · Admin Agone</title></svelte:head>

<div class="mb-5">
  <h2 class="text-xl font-bold">Utilisateurs</h2>
  <p class="text-sm text-muted-foreground">
    {data.total} compte{data.total > 1 ? 's' : ''}
    {#if data.byRole.customer}· {data.byRole.customer} client{data.byRole.customer > 1 ? 's' : ''}{/if}
  </p>
</div>

<div class="mb-4 flex flex-wrap gap-2">
  <div class="relative min-w-[240px] flex-1">
    <MagnifyingGlass size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input bind:value={q} oninput={onSearch} placeholder="Nom ou e-mail…" autocomplete="off"
      class="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
  </div>
  <select value={data.role ?? ''} onchange={(e) => nav({ role: e.currentTarget.value || undefined, page: 1 })}
    class="h-10 rounded-md border border-border bg-background px-3 text-sm">
    <option value="">Tous les rôles</option>
    <option value="customer">Clients</option>
    <option value="admin">Admins</option>
    <option value="editor">Éditeurs</option>
    <option value="pending">En attente</option>
  </select>
</div>

<div class="overflow-x-auto rounded-lg border border-border bg-card">
  <table class="w-full text-sm">
    <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
      <tr>
        <th class="px-3 py-2 font-medium">Nom</th>
        <th class="px-3 py-2 font-medium">E-mail</th>
        <th class="px-3 py-2 font-medium">Rôle</th>
        <th class="px-3 py-2 text-right font-medium">Commandes</th>
        <th class="px-3 py-2 text-right font-medium">Inscrit le</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each data.users as u (u.id)}
        <tr class="hover:bg-muted/30">
          <td class="px-3 py-2">
            <span class="font-medium">{u.full_name}</span>
            {#if u.legacy}<span class="ml-1.5 rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">Importé</span>{/if}
          </td>
          <td class="px-3 py-2 text-muted-foreground">
            {u.email || '—'}
            {#if u.email && !u.email_verified}<span class="ml-1 text-[10px] text-warning">non vérifié</span>{/if}
          </td>
          <td class="px-3 py-2"><span class="rounded px-2 py-0.5 text-xs font-medium {roleTone[u.role] ?? 'bg-secondary'}">{roleLabel[u.role] ?? u.role}</span></td>
          <td class="px-3 py-2 text-right tabular-nums">
            {#if u.orders > 0}<a href="/admin/commandes?q={encodeURIComponent(u.email)}" class="hover:text-link">{u.orders}</a>{:else}<span class="text-muted-foreground">0</span>{/if}
          </td>
          <td class="px-3 py-2 text-right text-muted-foreground">{dateFr(u.created_at)}</td>
        </tr>
      {/each}
      {#if data.users.length === 0}
        <tr><td colspan="5" class="px-3 py-10 text-center text-muted-foreground">Aucun utilisateur.</td></tr>
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
