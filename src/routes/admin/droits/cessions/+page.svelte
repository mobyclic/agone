<script lang="ts">
  /**
   * Cessions de droits : ce qu'Agone vend à des éditeurs étrangers et ce qu'il
   * acquiert auprès d'eux. Les sommes encaissées sur une cession vendue
   * alimentent la reddition des auteurs du livre.
   */
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, Plus, MagnifyingGlass, ArrowUpRight, ArrowDownLeft } from 'phosphor-svelte';

  let { data } = $props();
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const lbl = 'mb-1 block text-xs font-medium text-muted-foreground';
  const eur = (n: number, d = 'EUR') =>
    `${(n ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${d === 'EUR' ? '€' : d}`;
  const jour = (d?: string) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');
  const KIND: Record<string, string> = {
    translation: 'Traduction', pocket: 'Poche', club: 'Club', audio: 'Audio', film: 'Audiovisuel',
    digital: 'Numérique', other: 'Autre'
  };
  const STATUT: Record<string, string> = { draft: 'Brouillon', active: 'En cours', expired: 'Échue', terminated: 'Résiliée' };

  // Sélection du livre pour une nouvelle cession.
  let recherche = $state('');
  let livres = $state<any[]>([]);
  let livre = $state<{ id: string; title: string } | null>(null);
  let minuteur: ReturnType<typeof setTimeout>;
  function chercher() {
    clearTimeout(minuteur);
    const q = recherche.trim();
    if (q.length < 2) { livres = []; return; }
    minuteur = setTimeout(async () => {
      try { livres = await (await fetch(`/api/books/search?q=${encodeURIComponent(q)}`)).json(); }
      catch { livres = []; }
    }, 200);
  }
</script>

<svelte:head><title>Cessions de droits · Admin</title></svelte:head>

<a href="/admin/droits" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Droits d’auteur</a>
<h2 class="text-xl font-bold">Cessions de droits</h2>
<p class="mb-6 text-sm text-muted-foreground">
  Droits <strong>vendus</strong> à un éditeur étranger (Agone encaisse, les auteurs en touchent une part) et droits
  <strong>acquis</strong> auprès d’un ayant droit (Agone doit des redevances).
</p>

<div class="grid gap-6 lg:grid-cols-[1fr_340px]">
  <div>
    <div class="mb-3 flex gap-1.5">
      {#each [['', 'Toutes'], ['out', 'Droits vendus'], ['in', 'Droits acquis']] as [v, l] (v)}
        <a href="/admin/droits/cessions{v ? `?sens=${v}` : ''}"
          class="rounded-full border px-3 py-1 text-xs {data.direction === v ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-primary hover:text-foreground'}">{l}</a>
      {/each}
    </div>

    <div class="overflow-x-auto rounded-lg border border-border bg-card">
      <table class="w-full text-sm">
        <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">Livre</th>
            <th class="px-3 py-2 font-medium">Contrepartie</th>
            <th class="px-3 py-2 font-medium">Objet</th>
            <th class="px-3 py-2 text-right font-medium">À-valoir</th>
            <th class="px-3 py-2 text-right font-medium">Réglé</th>
            <th class="px-3 py-2 text-right font-medium">En attente</th>
            <th class="px-3 py-2 font-medium">Statut</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          {#each data.deals as d (d.id)}
            <tr class="cursor-pointer hover:bg-muted/30" onclick={() => (window.location.href = `/admin/droits/cessions/${d.id}`)}>
              <td class="px-3 py-2">
                <span class="inline-flex items-center gap-1.5 font-medium">
                  {#if d.direction === 'out'}<ArrowUpRight size={14} class="text-success" />{:else}<ArrowDownLeft size={14} class="text-link" />{/if}
                  {d.book_title}
                </span>
                <span class="block text-xs text-muted-foreground">signée le {jour(d.signed_at)}</span>
              </td>
              <td class="px-3 py-2">{d.counterparty}{#if d.language}<span class="block text-xs text-muted-foreground">{d.language}</span>{/if}</td>
              <td class="px-3 py-2 text-muted-foreground">{KIND[d.kind] ?? d.kind}</td>
              <td class="px-3 py-2 text-right tabular-nums">{d.advance ? eur(d.advance, d.currency) : '—'}</td>
              <td class="px-3 py-2 text-right tabular-nums">{d.encaisse ? eur(d.encaisse, d.currency) : '—'}</td>
              <td class="px-3 py-2 text-right tabular-nums {d.en_attente ? 'text-warning' : 'text-muted-foreground'}">{d.en_attente ? eur(d.en_attente, d.currency) : '—'}</td>
              <td class="px-3 py-2 text-xs text-muted-foreground">{STATUT[d.status] ?? d.status}</td>
            </tr>
          {/each}
          {#if data.deals.length === 0}
            <tr><td colspan="7" class="px-3 py-10 text-center text-muted-foreground">Aucune cession enregistrée.</td></tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>

  <div class="rounded-lg border border-border bg-card p-5">
    <h3 class="eyebrow mb-3">Nouvelle cession</h3>
    <form method="POST" action="?/create" use:enhance class="space-y-3">
      <div>
        <span class={lbl}>Livre</span>
        {#if livre}
          <div class="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
            <span class="truncate font-medium">{livre.title}</span>
            <button type="button" class="text-xs text-link hover:underline" onclick={() => { livre = null; recherche = ''; }}>changer</button>
          </div>
          <input type="hidden" name="bookId" value={livre.id} />
        {:else}
          <div class="relative">
            <MagnifyingGlass size={15} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input bind:value={recherche} oninput={chercher} placeholder="Chercher un titre…" class="{input} pl-9" />
          </div>
          {#if livres.length}
            <ul class="mt-1 max-h-56 overflow-y-auto rounded-md border border-border">
              {#each livres as b (b.id)}
                <li>
                  <button type="button" class="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
                    onclick={() => { livre = { id: String(b.id).replace('book:', ''), title: b.title }; livres = []; }}>{b.title}</button>
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
      </div>
      <label class={lbl}>Sens
        <select name="direction" class={input}>
          <option value="out">Droits vendus (Agone encaisse)</option>
          <option value="in">Droits acquis (Agone paie)</option>
        </select>
      </label>
      <label class={lbl}>Contrepartie <input name="counterparty" placeholder="ex. Hoja de Lata Editorial" class={input} /></label>
      <label class={lbl}>Langue <input name="language" placeholder="ex. espagnol" class={input} /></label>
      <div class="grid grid-cols-2 gap-3">
        <label class={lbl}>Signature <input name="signed_at" type="date" class={input} /></label>
        <label class={lbl}>À-valoir (€) <input name="advance" type="number" step="0.01" class={input} /></label>
      </div>
      <Button type="submit" class="w-full" disabled={!livre}><Plus size={15} /> Créer la cession</Button>
      <p class="text-xs text-muted-foreground">Taux, territoire, durée et échéances se règlent ensuite sur sa fiche.</p>
    </form>
  </div>
</div>
