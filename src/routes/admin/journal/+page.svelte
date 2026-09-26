<script lang="ts">
  /** Journal des actions : qui a fait quoi, sur quoi, quand. */
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { MagnifyingGlass } from 'phosphor-svelte';
  import { lienCible } from '$lib/server/journal';
  let { data } = $props();

  const TYPES: Record<string, string> = {
    order: 'Commandes', book: 'Livres', author: 'Auteurs', royalty_contract: 'Contrats', royalty_statement: 'Redditions',
    rights_deal: 'Cessions', article: 'Articles', user: 'Comptes', site_setting: 'Réglages', newsletter: 'LettrInfo'
  };
  const ACTIONS: Record<string, string> = {
    'commande.statut': 'Statut de commande', 'commande.suivi': 'Suivi de colis', 'commande.remboursement': 'Remboursement',
    'commande.confirmation': 'Confirmation renvoyée', 'livre.enregistre': 'Livre enregistré', 'livre.supprime': 'Livre supprimé',
    'contrat.enregistre': 'Contrat enregistré', 'contrat.supprime': 'Contrat supprimé', 'reddition.statut': 'Statut de reddition',
    'reddition.generee': 'Redditions générées', 'cession.enregistree': 'Cession enregistrée', 'lettrinfo.envoi': 'LettrInfo envoyée',
    'compte.modifie': 'Compte modifié', 'reglages.droits': 'Règles de calcul', 'stock.seuil': 'Seuil de stock'
  };
  const quand = (s: string) => new Date(s).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  const detailsLisibles = (d: any) =>
    d ? Object.entries(d).filter(([k]) => !['number', 'slug', 'book_id'].includes(k)).map(([k, v]) => `${k} : ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ') : '';

  let q = $state(untrack(() => data.q ?? ''));
  let minuteur: ReturnType<typeof setTimeout>;
  const nav = (p: Record<string, string | number | undefined>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: data.q, type: data.type, page: data.page, ...p })) if (v !== undefined && v !== '' && !(k === 'page' && v === 1)) sp.set(k, String(v));
    goto(`/admin/journal${sp.size ? `?${sp}` : ''}`, { keepFocus: true, noScroll: true });
  };
  const pages = $derived(Math.max(1, Math.ceil(data.total / data.limit)));
</script>

<svelte:head><title>Journal · Admin</title></svelte:head>

<div class="mb-5">
  <h2 class="text-xl font-bold">Journal des actions</h2>
  <p class="text-sm text-muted-foreground">{data.total} action{data.total > 1 ? 's' : ''} enregistrée{data.total > 1 ? 's' : ''}. Seules les opérations qui engagent y figurent.</p>
</div>

<div class="mb-4 flex flex-wrap gap-2">
  <div class="relative min-w-[240px] flex-1">
    <MagnifyingGlass size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input bind:value={q} oninput={() => { clearTimeout(minuteur); minuteur = setTimeout(() => nav({ q, page: 1 }), 250); }}
      placeholder="Titre, commande, personne…" class="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
  </div>
  <select value={data.type ?? ''} onchange={(e) => nav({ type: e.currentTarget.value || undefined, page: 1 })} class="h-10 rounded-md border border-border bg-background px-3 text-sm">
    <option value="">Tout</option>
    {#each Object.entries(TYPES) as [k, v] (k)}<option value={k}>{v}</option>{/each}
  </select>
</div>

<div class="overflow-x-auto rounded-lg border border-border bg-card">
  <table class="w-full text-sm">
    <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
      <tr><th class="px-3 py-2 font-medium">Quand</th><th class="px-3 py-2 font-medium">Qui</th><th class="px-3 py-2 font-medium">Action</th><th class="px-3 py-2 font-medium">Sur</th><th class="px-3 py-2 font-medium">Détails</th></tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each data.entrees as e (e.id)}
        {@const lien = lienCible(e.target_type, e.target_id, e.details)}
        <tr class="align-top hover:bg-muted/30">
          <td class="whitespace-nowrap px-3 py-2 text-muted-foreground">{quand(e.created_at)}</td>
          <td class="px-3 py-2">{e.actor_name ?? '—'}</td>
          <td class="px-3 py-2">{ACTIONS[e.action] ?? e.action}</td>
          <td class="px-3 py-2">
            {#if lien}<a href={lien} class="font-medium hover:text-link">{e.target_label ?? e.target_id}</a>{:else}{e.target_label ?? e.target_id ?? '—'}{/if}
            {#if e.target_type}<span class="ml-1 text-xs text-muted-foreground">{TYPES[e.target_type] ?? e.target_type}</span>{/if}
          </td>
          <td class="px-3 py-2 text-xs text-muted-foreground">{detailsLisibles(e.details)}</td>
        </tr>
      {/each}
      {#if data.entrees.length === 0}<tr><td colspan="5" class="px-3 py-10 text-center text-muted-foreground">Rien dans le journal.</td></tr>{/if}
    </tbody>
  </table>
</div>

{#if pages > 1}
  <div class="mt-4 flex items-center justify-between text-sm">
    <button type="button" class="rounded-md border border-border px-3 py-1.5 disabled:opacity-40" disabled={data.page <= 1} onclick={() => nav({ page: data.page - 1 })}>← Précédent</button>
    <span class="text-muted-foreground">Page {data.page} / {pages}</span>
    <button type="button" class="rounded-md border border-border px-3 py-1.5 disabled:opacity-40" disabled={data.page >= pages} onclick={() => nav({ page: data.page + 1 })}>Suivant →</button>
  </div>
{/if}
