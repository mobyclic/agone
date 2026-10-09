<script lang="ts">
  /**
   * Médiathèque : tous les fichiers déposés, par usage (livres, auteurs, rencontres,
   * Antichambre, images de l'éditeur, documents), avec ce qui les utilise. Un fichier
   * inutilisé peut être supprimé ; un fichier utilisé aussi, après confirmation —
   * il est alors détaché de ce qui l'utilisait.
   */
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import Pagination from '$lib/components/Pagination.svelte';
  import { MagnifyingGlass, FileText, Trash, LockSimple, ArrowSquareOut } from 'phosphor-svelte';

  let { data, form } = $props();
  $effect(() => { if (form?.error) toast.error(form.error); });
  let q = $state(untrack(() => data.q));
  let timer: ReturnType<typeof setTimeout>;
  const pageCount = $derived(Math.max(1, Math.ceil(data.total / data.limit)));
  function nav(params: Record<string, string | number | undefined>) {
    const merged: Record<string, string | number | undefined> = { usage: data.usage || undefined, q, page: data.page, ...params };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== '' && !(k === 'page' && v === 1)) sp.set(k, String(v));
    goto(`/admin/mediatheque${sp.size ? `?${sp}` : ''}`, { keepFocus: true, replaceState: true, noScroll: true });
  }
  const onSearch = () => { clearTimeout(timer); timer = setTimeout(() => nav({ q, page: 1 }), 220); };
  const taille = (n?: number) => (n == null ? '' : n > 1e6 ? `${(n / 1e6).toFixed(1)} Mo` : `${Math.round(n / 1e3)} Ko`);
  const dateFr = (s: string) => new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const nom = (m: (typeof data.medias)[number]) => m.filename || m.key.split('/').pop() || m.key;
</script>

<svelte:head><title>Médiathèque · Admin Agone</title></svelte:head>

<div class="mb-5 flex flex-wrap items-end justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">Médiathèque</h2>
    <p class="text-sm text-muted-foreground">{data.total} fichier{data.total > 1 ? 's' : ''} · les images s'ajoutent depuis les fiches (livre, auteur, rencontre, article) ou l'éditeur de texte.</p>
  </div>
  <div class="relative min-w-[260px]">
    <MagnifyingGlass size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input bind:value={q} oninput={onSearch} placeholder="Nom de fichier, chemin, légende…" autocomplete="off" class="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
  </div>
</div>

<div class="mb-4 flex flex-wrap gap-1 rounded-md border border-border bg-background p-1 text-sm">
  <button type="button" onclick={() => nav({ usage: undefined, page: 1 })} class="rounded px-3 py-1.5 {!data.usage ? 'bg-foreground text-background' : 'hover:bg-muted'}">Tout</button>
  {#each Object.entries(data.usages) as [u, d] (u)}
    <button type="button" onclick={() => nav({ usage: u, page: 1 })} class="rounded px-3 py-1.5 {data.usage === u ? 'bg-foreground text-background' : 'hover:bg-muted'}">{d.label} <span class="opacity-60">{data.comptes[u as keyof typeof data.comptes]}</span></button>
  {/each}
</div>

{#if data.medias.length === 0}
  <div class="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">Aucun fichier.</div>
{:else}
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
    {#each data.medias as m (m.id)}
      <div class="flex gap-3 rounded-lg border border-border bg-card p-3">
        <div class="size-24 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
          {#if m.image && !m.prive}
            <a href={m.url} target="_blank" rel="noopener"><img src={m.url} alt={m.alt ?? ''} loading="lazy" class="size-full object-cover" /></a>
          {:else}
            <div class="grid size-full place-items-center text-muted-foreground">{#if m.prive}<LockSimple size={22} />{:else}<FileText size={22} />{/if}</div>
          {/if}
        </div>
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium" title={m.key}>{nom(m)}</div>
          <div class="text-xs text-muted-foreground">{data.usages[m.usage].label} · {dateFr(m.created_at)}{#if m.size} · {taille(m.size)}{/if}{#if m.width && m.height} · {m.width}×{m.height}{/if}</div>
          {#if m.liens.length}
            <ul class="mt-1 space-y-0.5 text-xs">
              {#each m.liens as l (l.href + l.label)}<li><a href={l.href} class="text-link underline-offset-4 hover:underline">{l.label}</a></li>{/each}
            </ul>
          {:else}
            <div class="mt-1 text-xs text-warning">Non utilisé</div>
          {/if}
          <div class="mt-2 flex items-center gap-3 text-xs">
            {#if !m.prive}<a href={m.url} target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><ArrowSquareOut size={12} /> Ouvrir</a>{/if}
            <form method="POST" action="?/supprimer" use:enhance class="inline" onsubmit={(e) => { if (!confirm(`Supprimer « ${nom(m)} » définitivement ?${m.liens.length ? ' Il sera détaché de ce qui l’utilise.' : ''}`)) e.preventDefault(); }}>
              <input type="hidden" name="id" value={m.id} /><input type="hidden" name="nom" value={nom(m)} />
              <button type="submit" class="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive"><Trash size={12} /> Supprimer</button>
            </form>
          </div>
        </div>
      </div>
    {/each}
  </div>
  <Pagination page={data.page} {pageCount} onpage={(p) => nav({ page: p })} />
{/if}
