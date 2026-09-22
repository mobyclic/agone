<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import Pagination from '$lib/components/Pagination.svelte';
  import SearchSelect from '$lib/components/SearchSelect.svelte';
  import { MagnifyingGlass, UserPlus, X } from 'phosphor-svelte';

  let { data, form } = $props();

  let showNew = $state(false);
  let creating = $state(false);
  const inp = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const lbl = 'mb-1 block text-sm font-medium';
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
    const merged: Record<string, string | number | undefined> = {
      q, role: data.role, page: data.page, livre: data.livre?.id, auteur: data.auteur?.id,
      min: data.min || undefined, sansnom: data.sansNom ? '1' : undefined, ...params
    };
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
    {#if data.filtreAchat || data.q || data.role}
      {data.total} compte{data.total > 1 ? 's' : ''} correspondant{data.total > 1 ? 's' : ''}
    {:else}
      {data.total} compte{data.total > 1 ? 's' : ''}
      {#if data.byRole.customer}· dont {data.byRole.customer} client{data.byRole.customer > 1 ? 's' : ''}{/if}
    {/if}
    {#if data.anonymes && !data.sansNom}
      · <button type="button" onclick={() => nav({ sansnom: '1', page: 1 })} class="underline hover:text-foreground">{data.anonymes} comptes sans nom masqués</button>
    {:else if data.sansNom}
      · <button type="button" onclick={() => nav({ sansnom: undefined, page: 1 })} class="underline hover:text-foreground">masquer les comptes sans nom</button>
    {/if}
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
  <Button type="button" variant="brand" class="h-10" onclick={() => (showNew = true)}><UserPlus size={16} /> Nouvel utilisateur</Button>
</div>

<!-- Filtres d'achat (commandes payées) -->
<div class="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
  <span class="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Achats</span>
  <SearchSelect class="w-64" searchUrl="/api/books/search" labelField="title" placeholder="A acheté le livre…"
    value={data.livre} onselect={(v) => nav({ livre: v?.id.replace(/^book:/, ''), page: 1 })} />
  <SearchSelect class="w-64" searchUrl="/api/authors/search" labelField="full_name" placeholder="…un livre de l'auteur"
    value={data.auteur} onselect={(v) => nav({ auteur: v?.id.replace(/^author:/, ''), page: 1 })} />
  <select value={String(data.min || '')} onchange={(e) => nav({ min: e.currentTarget.value || undefined, page: 1 })}
    class="h-10 rounded-md border border-border bg-background px-3 text-sm">
    <option value="">Nombre de commandes</option>
    {#each [1, 2, 3, 5, 10] as n (n)}<option value={String(n)}>{n === 1 ? 'Au moins 1 commande' : `${n} commandes ou plus`}</option>{/each}
  </select>
  {#if data.filtreAchat}
    <button type="button" onclick={() => nav({ livre: undefined, auteur: undefined, min: undefined, page: 1 })} class="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><X size={14} /> Effacer</button>
  {/if}
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
        <tr class="cursor-pointer hover:bg-muted/30" onclick={(e) => { if (!(e.target as HTMLElement).closest('a,button')) goto(`/admin/utilisateurs/${u.id}`); }}>
          <td class="px-3 py-2">
            <a href="/admin/utilisateurs/{u.id}" class="font-medium hover:text-link">{u.full_name}</a>
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

{#if showNew}
  <div class="fixed inset-0 z-[60] grid place-items-center p-4">
    <button type="button" class="absolute inset-0 cursor-default bg-black/50" aria-label="Fermer" onclick={() => (showNew = false)}></button>
    <div class="relative z-10 w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-2xl">
      <button type="button" onclick={() => (showNew = false)} class="absolute right-3 top-3 grid size-8 place-items-center text-muted-foreground hover:text-foreground" aria-label="Fermer"><X size={18} /></button>
      <h3 class="text-lg font-bold">Nouvel utilisateur</h3>

      {#if form?.error}<p class="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}

      <form method="POST" action="?/create"
        use:enhance={() => { creating = true; return async ({ update }) => { await update(); creating = false; }; }}
        class="mt-4 space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <label class={lbl}>Prénom <input name="first_name" class={inp} autocomplete="off" /></label>
          <label class={lbl}>Nom <input name="last_name" class={inp} autocomplete="off" /></label>
        </div>
        <label class={lbl}>E-mail <input name="email" type="email" required class={inp} autocomplete="off" /></label>
        <label class={lbl}>Rôle
          <select name="role" class={inp}>
            <option value="customer">Client</option>
            <option value="editor">Éditeur</option>
            <option value="admin">Admin</option>
            <option value="pending">En attente</option>
          </select>
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onclick={() => (showNew = false)}>Annuler</Button>
          <Button type="submit" variant="brand" disabled={creating}>{creating ? 'Création…' : 'Créer'}</Button>
        </div>
      </form>
    </div>
  </div>
{/if}

<Pagination page={data.page} {pageCount} onpage={(p) => nav({ page: p })} />
