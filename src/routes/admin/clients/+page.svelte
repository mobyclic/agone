<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import Pagination from '$lib/components/Pagination.svelte';
  import SearchSelect from '$lib/components/SearchSelect.svelte';
  import { MagnifyingGlass, UserPlus, X, Buildings, Plus } from 'phosphor-svelte';
  import { euros } from '$lib/labels';

  let { data, form } = $props();

  let showNew = $state(false);
  let creating = $state(false);
  const inp = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const lbl = 'mb-1 block text-sm font-medium';
  const pageCount = $derived(Math.max(1, Math.ceil(data.total / data.limit)));
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

  let q = $state(untrack(() => data.q ?? ''));
  let timer: ReturnType<typeof setTimeout>;
  function nav(params: Record<string, string | number | undefined>) {
    const merged: Record<string, string | number | undefined> = {
      liste: data.liste, kind: data.kind,
      q, page: data.page, livre: data.livre?.id, auteur: data.auteur?.id,
      min: data.min || undefined, ...params
    };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === '' || (k === 'page' && v === 1)) continue;
      sp.set(k, String(v));
    }
    const s = sp.toString();
    goto(`/admin/clients${s ? `?${s}` : ''}`, { keepFocus: true, replaceState: true, noScroll: true });
  }
  function onSearch() { clearTimeout(timer); timer = setTimeout(() => nav({ q, page: 1 }), 220); }
</script>

<svelte:head><title>Clients · Admin Agone</title></svelte:head>

<div class="mb-5">
  <h2 class="text-xl font-bold">Clients</h2>
  <p class="text-sm text-muted-foreground">
    {data.total} client{data.total > 1 ? 's' : ''}{data.q || data.filtreAchat || data.liste || data.kind ? ' correspondant' + (data.total > 1 ? 's' : '') : ''}
    — personnes physiques ou morales ; « web » : acheteur du site (entré au registre à sa première commande payée), « pro » : facturé. Un client peut être les deux.
  </p>
</div>

<div class="mb-4 flex flex-wrap gap-2">
  <div class="relative min-w-[240px] flex-1">
    <MagnifyingGlass size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input bind:value={q} oninput={onSearch} placeholder="Nom, ville, e-mail, contact…" autocomplete="off"
      class="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
  </div>
  <select value={data.liste ?? ''} onchange={(e) => nav({ liste: e.currentTarget.value || undefined, page: 1 })} class="h-10 rounded-md border border-border bg-background px-3 text-sm" aria-label="Liste">
    <option value="">Tous ({data.comptes.tous})</option>
    <option value="web">Web ({data.comptes.web})</option>
    <option value="pro">Pro ({data.comptes.pro})</option>
  </select>
  <select value={data.kind ?? ''} onchange={(e) => nav({ kind: e.currentTarget.value || undefined, page: 1 })} class="h-10 rounded-md border border-border bg-background px-3 text-sm" aria-label="Type">
    <option value="">Tous types</option>
    {#each Object.entries(data.kinds) as [k, nom] (k)}<option value={k}>{nom}</option>{/each}
  </select>
  <Button href="/admin/clients/pro/nouveau" variant="brand" class="h-10"><Plus size={16} /> Nouveau client</Button>
  <Button type="button" variant="outline" class="h-10" onclick={() => (showNew = true)} title="Créer un compte sur le site (pour un acheteur web)"><UserPlus size={16} /> Compte web</Button>
</div>

<!-- Achats sur le site (commandes payées du compte lié) -->
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
        <th class="px-3 py-2 font-medium">Liste</th>
        <th class="px-3 py-2 font-medium">Ville</th>
        <th class="px-3 py-2 font-medium">Contact</th>
        <th class="px-3 py-2 text-right font-medium">Commandes</th>
        <th class="px-3 py-2 text-right font-medium">Factures</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each data.clients as c (c.id)}
        {@const href = !c.pro && c.user ? `/admin/utilisateurs/${c.user}` : `/admin/clients/pro/${c.id}`}
        <tr class="cursor-pointer hover:bg-muted/30" onclick={(e) => { if (!(e.target as HTMLElement).closest('a,button')) goto(href); }}>
          <td class="px-3 py-2">
            <a {href} class="inline-flex items-center gap-1.5 font-medium hover:text-link">{#if c.personne === 'morale'}<Buildings size={15} class="text-muted-foreground" />{/if}{c.name}</a>
            {#if c.pro && c.kind !== 'autre'}<span class="ml-1 text-xs text-muted-foreground">{data.kinds[c.kind] ?? c.kind}</span>{/if}
          </td>
          <td class="whitespace-nowrap px-3 py-2">
            {#if c.web}{#if c.user}<a href="/admin/utilisateurs/{c.user}" class="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground hover:text-foreground" title="Compte du site">web</a>{:else}<span class="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">web</span>{/if}{/if}
            {#if c.pro}<a href="/admin/clients/pro/{c.id}" class="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] uppercase text-foreground hover:bg-foreground hover:text-background" title="Fiche client (facturation)">pro</a>{/if}
          </td>
          <td class="px-3 py-2 text-muted-foreground">{[c.postcode, c.city].filter(Boolean).join(' ') || '—'}</td>
          <td class="px-3 py-2 text-muted-foreground">{c.contact_name || c.email || '—'}</td>
          <td class="whitespace-nowrap px-3 py-2 text-right tabular-nums">
            {#if c.commandes > 0}<a href="/admin/commandes?q={encodeURIComponent(c.email ?? '')}" class="hover:text-link" title="Dernière : {dateFr(c.derniere_commande)}">{c.commandes} · {euros(c.commandes_total)}</a>{:else}<span class="text-muted-foreground">—</span>{/if}
          </td>
          <td class="whitespace-nowrap px-3 py-2 text-right tabular-nums">{#if c.factures}{c.factures} · {euros(c.facture_total)}{:else}<span class="text-muted-foreground">—</span>{/if}</td>
        </tr>
      {/each}
      {#if data.clients.length === 0}
        <tr><td colspan="6" class="px-3 py-10 text-center text-muted-foreground">Aucun client.</td></tr>
      {/if}
    </tbody>
  </table>
</div>

{#if showNew}
  <div class="fixed inset-0 z-[60] grid place-items-center p-4">
    <button type="button" class="absolute inset-0 cursor-default bg-black/50" aria-label="Fermer" onclick={() => (showNew = false)}></button>
    <div class="relative z-10 w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-2xl">
      <button type="button" onclick={() => (showNew = false)} class="absolute right-3 top-3 grid size-8 place-items-center text-muted-foreground hover:text-foreground" aria-label="Fermer"><X size={18} /></button>
      <h3 class="text-lg font-bold">Nouveau compte web</h3>
      <p class="mt-1 text-xs text-muted-foreground">Un compte client, sans mot de passe : il pourra en définir un depuis « mot de passe oublié ». Il entre au registre comme client web ; pour une fiche de facturation, utilisez « Nouveau client ».</p>


      <form method="POST" action="?/create"
        use:enhance={() => { creating = true; return async ({ update }) => { await update(); creating = false; }; }}
        class="mt-4 space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <label class={lbl}>Prénom <input name="first_name" class={inp} autocomplete="off" /></label>
          <label class={lbl}>Nom <input name="last_name" class={inp} autocomplete="off" /></label>
        </div>
        <label class={lbl}>E-mail <input name="email" type="email" required class={inp} autocomplete="off" /></label>
        <div class="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onclick={() => (showNew = false)}>Annuler</Button>
          <Button type="submit" variant="brand" disabled={creating}>{creating ? 'Création…' : 'Créer'}</Button>
        </div>
      </form>
    </div>
  </div>
{/if}

<Pagination page={data.page} {pageCount} onpage={(p) => nav({ page: p })} />
