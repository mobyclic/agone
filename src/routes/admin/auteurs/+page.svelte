<script lang="ts">
  import { untrack } from 'svelte';
  import { goto, replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import Pagination from '$lib/components/Pagination.svelte';
  import { deburr } from '$lib/text';
  import { Plus, MagnifyingGlass, CaretUp, CaretDown, DownloadSimple, X } from 'phosphor-svelte';
  import type { AuthorOverviewRow } from '$lib/server/authors';

  let { data } = $props();

  /**
   * « Auteurs & Co » — tout se passe côté client sur la liste complète (~1 000
   * lignes) : la recherche répond à chaque frappe, sans aller-retour serveur.
   * L'état (recherche, filtre, tri, page) est reflété dans l'URL pour survivre
   * au retour arrière depuis une fiche.
   */
  const PAR_PAGE = 50;
  type Filtre = 'tous' | 'auteurs' | 'traducteurs' | 'prefaces' | 'antichambre' | 'masques';
  type Col = 'nom' | 'prenom' | 'livres' | 'postfaces' | 'prefaces' | 'traductions' | 'contributions' | 'articles' | 'visibilite' | 'depuis';
  const FILTRES: { id: Filtre; label: string; test: (a: AuthorOverviewRow) => boolean }[] = [
    { id: 'tous', label: 'Tous', test: () => true },
    { id: 'auteurs', label: 'Auteurs', test: (a) => a.livres > 0 },
    { id: 'traducteurs', label: 'Traducteurs', test: (a) => a.traductions > 0 },
    { id: 'prefaces', label: 'Préfaces & postfaces', test: (a) => a.prefaces + a.postfaces > 0 },
    { id: 'antichambre', label: 'Antichambre', test: (a) => a.articles > 0 },
    { id: 'masques', label: 'Masqués', test: (a) => a.hidden }
  ];

  const sp = untrack(() => page.url.searchParams);
  let q = $state(sp.get('q') ?? '');
  let filtre = $state<Filtre>((sp.get('f') as Filtre) || 'tous');
  let tri = $state<Col>((sp.get('sort') as Col) || 'nom');
  let sens = $state<'asc' | 'desc'>(sp.get('dir') === 'desc' ? 'desc' : 'asc');
  let pageCourante = $state(Math.max(1, Number(sp.get('page')) || 1));

  const annee = (d?: string) => (d ? new Date(d).getFullYear() : undefined);
  const anciennete = (d?: string) => {
    if (!d) return undefined;
    const ans = Math.floor((Date.now() - new Date(d).getTime()) / (365.25 * 86400e3));
    return ans < 1 ? 'moins d’un an' : `${ans} an${ans > 1 ? 's' : ''}`;
  };

  const cle: Record<Col, (a: AuthorOverviewRow) => string | number> = {
    nom: (a) => deburr(a.last_name || a.full_name),
    prenom: (a) => deburr(a.first_name),
    livres: (a) => a.livres,
    postfaces: (a) => a.postfaces,
    prefaces: (a) => a.prefaces,
    traductions: (a) => a.traductions,
    contributions: (a) => a.contributions,
    articles: (a) => a.articles,
    visibilite: (a) => (a.hidden ? 1 : 0),
    // Sans date = tout au bout, quel que soit le sens.
    depuis: (a) => a.depuis ?? (sens === 'asc' ? '9999' : '0000')
  };

  const filtres = $derived.by(() => {
    const aiguille = deburr(q.trim());
    const f = FILTRES.find((x) => x.id === filtre) ?? FILTRES[0];
    return data.authors.filter(
      (a) => f.test(a) && (!aiguille || deburr(`${a.full_name} ${a.last_name} ${a.first_name}`).includes(aiguille))
    );
  });
  const tries = $derived.by(() => {
    const k = cle[tri];
    const m = sens === 'asc' ? 1 : -1;
    return [...filtres].sort((x, y) => {
      const a = k(x), b = k(y);
      const c = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'fr');
      return c !== 0 ? c * m : cle.nom(x).toString().localeCompare(cle.nom(y).toString(), 'fr');
    });
  });
  const pageCount = $derived(Math.max(1, Math.ceil(tries.length / PAR_PAGE)));
  const visibles = $derived(tries.slice((pageCourante - 1) * PAR_PAGE, pageCourante * PAR_PAGE));
  const compte = (f: (typeof FILTRES)[number]) => data.authors.filter(f.test).length;

  // L'URL suit l'état (sans navigation ni rechargement).
  $effect(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (filtre !== 'tous') p.set('f', filtre);
    if (tri !== 'nom') p.set('sort', tri);
    if (sens !== 'asc') p.set('dir', sens);
    if (pageCourante > 1) p.set('page', String(pageCourante));
    const s = p.toString();
    untrack(() => { try { replaceState(`/admin/auteurs${s ? `?${s}` : ''}`, {}); } catch { /* routeur pas prêt */ } });
  });

  function trierPar(col: Col) {
    // Colonnes numériques : du plus grand au plus petit au premier clic.
    const numerique = !['nom', 'prenom', 'visibilite', 'depuis'].includes(col);
    if (tri === col) sens = sens === 'asc' ? 'desc' : 'asc';
    else { tri = col; sens = numerique ? 'desc' : 'asc'; }
    pageCourante = 1;
  }
  function changerPage(p: number) {
    pageCourante = Math.min(Math.max(1, p), pageCount);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Export CSV de la sélection COURANTE (recherche + filtre + tri), toutes pages. */
  function exporter() {
    const cols: [string, (a: AuthorOverviewRow) => string | number][] = [
      ['Nom', (a) => a.last_name], ['Prénom', (a) => a.first_name], ['Nom complet', (a) => a.full_name],
      ['Livres', (a) => a.livres], ['Préfaces', (a) => a.prefaces], ['Postfaces', (a) => a.postfaces],
      ['Traductions', (a) => a.traductions], ['Autres contributions', (a) => a.contributions],
      ['Articles', (a) => a.articles], ['Rencontres', (a) => a.rencontres],
      ['Visibilité', (a) => (a.hidden ? 'Masqué' : 'Visible')],
      ['Première participation', (a) => (a.depuis ? a.depuis.slice(0, 10) : '')],
      ['Fiche publique', (a) => `${page.url.origin}/auteur/${a.slug}`]
    ];
    const cell = (v: string | number) => {
      const s = String(v ?? '');
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    // Point-virgule + BOM : ouverture directe dans un tableur réglé en français.
    const csv = '﻿' + [cols.map((c) => c[0]).join(';'), ...tries.map((a) => cols.map((c) => cell(c[1](a))).join(';'))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const lien = Object.assign(document.createElement('a'), {
      href: url,
      download: `agone-auteurs${filtre !== 'tous' ? `-${filtre}` : ''}-${new Date().toISOString().slice(0, 10)}.csv`
    });
    lien.click();
    URL.revokeObjectURL(url);
  }

  const initiales = (a: AuthorOverviewRow) =>
    ((a.first_name?.[0] ?? '') + (a.last_name?.[0] ?? a.full_name?.[0] ?? '')).toUpperCase();
  const n = (v: number) => (v > 0 ? v : '');
</script>

<svelte:head><title>Auteurs & Co · Admin Agone</title></svelte:head>

{#snippet th(col: Col, text: string, centre = false)}
  <th class="whitespace-nowrap px-2 py-2.5 text-[11px] font-medium {centre ? 'text-center' : ''}">
    <button type="button" onclick={() => trierPar(col)} class="inline-flex items-center gap-1 uppercase hover:text-foreground {tri === col ? 'text-foreground' : ''}">
      {text}
      {#if tri === col}
        {#if sens === 'asc'}<CaretUp size={11} weight="bold" />{:else}<CaretDown size={11} weight="bold" />{/if}
      {:else}<CaretDown size={11} class="opacity-25" />{/if}
    </button>
  </th>
{/snippet}

<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">Auteurs & Co</h2>
    <p class="text-sm text-muted-foreground">
      {#if filtres.length === data.authors.length}{data.authors.length} contributeurs{:else}{filtres.length} sur {data.authors.length} contributeurs{/if}
    </p>
  </div>
  <div class="flex gap-2">
    <Button variant="outline" onclick={exporter} disabled={!tries.length}><DownloadSimple size={16} /> Exporter ({tries.length})</Button>
    <Button href="/admin/auteurs/nouveau"><Plus size={16} /> Nouveau</Button>
  </div>
</div>

<div class="mb-4 flex flex-wrap items-center gap-3">
  <div class="relative w-full max-w-md">
    <MagnifyingGlass size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input bind:value={q} oninput={() => (pageCourante = 1)} placeholder="Rechercher un nom…" autocomplete="off" type="search"
      class="h-10 w-full rounded-md border border-border bg-background pl-9 pr-9 text-sm outline-none focus:border-primary" />
    {#if q}
      <button type="button" onclick={() => { q = ''; pageCourante = 1; }} class="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted" aria-label="Effacer"><X size={14} /></button>
    {/if}
  </div>
  <!-- Filtres rapides -->
  <div class="flex flex-wrap gap-1.5">
    {#each FILTRES as f (f.id)}
      <button type="button" onclick={() => { filtre = f.id; pageCourante = 1; }}
        class="rounded-full border px-3 py-1.5 text-sm transition-colors {filtre === f.id ? 'border-foreground bg-foreground text-background' : 'border-border bg-background hover:bg-muted'}">
        {f.label} <span class="ml-0.5 text-xs opacity-60">{compte(f)}</span>
      </button>
    {/each}
  </div>
</div>

<div class="overflow-x-auto rounded-lg border border-border bg-card">
  <table class="w-full text-[0.95rem]">
    <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
      <tr>
        <th class="w-14 px-2 py-2.5"><span class="sr-only">Portrait</span></th>
        {@render th('nom', 'Nom')}
        {@render th('prenom', 'Prénom')}
        {@render th('livres', 'Livres', true)}
        {@render th('postfaces', 'Postface', true)}
        {@render th('prefaces', 'Préface', true)}
        {@render th('traductions', 'Traductions', true)}
        {@render th('contributions', 'Contribution', true)}
        {@render th('articles', 'Articles', true)}
        {@render th('visibilite', 'Visibilité')}
        {@render th('depuis', 'Agone')}
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each visibles as a (a.id)}
        <tr class="cursor-pointer hover:bg-muted/40" onclick={(e) => { if (!(e.target as HTMLElement).closest('a')) goto(`/admin/auteurs/${a.slug}`); }}>
          <td class="px-3 py-2">
            {#if a.portrait_url}
              <img src={a.portrait_url} alt="" loading="lazy" class="size-10 rounded-full border border-border object-cover" />
            {:else}
              <span class="grid size-10 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">{initiales(a)}</span>
            {/if}
          </td>
          <td class="px-2 py-2"><a href="/admin/auteurs/{a.slug}" class="font-semibold uppercase tracking-wide hover:text-link">{a.last_name || a.full_name}</a></td>
          <td class="px-2 py-2">{a.first_name}</td>
          <td class="px-2 py-2 text-center tabular-nums font-medium">{n(a.livres)}</td>
          <td class="px-2 py-2 text-center tabular-nums">{n(a.postfaces)}</td>
          <td class="px-2 py-2 text-center tabular-nums">{n(a.prefaces)}</td>
          <td class="px-2 py-2 text-center tabular-nums">{n(a.traductions)}</td>
          <td class="px-2 py-2 text-center tabular-nums">{n(a.contributions)}</td>
          <td class="px-2 py-2 text-center tabular-nums">{n(a.articles)}</td>
          <td class="px-2 py-2">{#if a.hidden}<span class="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">Masqué</span>{:else}<span class="text-xs text-success">Visible</span>{/if}</td>
          <td class="whitespace-nowrap px-2 py-2" title={a.depuis ? `Première participation : ${new Date(a.depuis).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Aucune participation datée'}>
            {#if a.depuis}<span class="tabular-nums">{annee(a.depuis)}</span> <span class="text-xs text-muted-foreground">· {anciennete(a.depuis)}</span>{:else}<span class="text-muted-foreground">—</span>{/if}
          </td>
        </tr>
      {/each}
      {#if !visibles.length}
        <tr><td colspan="11" class="px-3 py-10 text-center text-muted-foreground">Aucun contributeur ne correspond.</td></tr>
      {/if}
    </tbody>
  </table>
</div>

<Pagination page={pageCourante} {pageCount} onpage={changerPage} />
