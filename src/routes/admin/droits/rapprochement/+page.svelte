<script lang="ts">
  /**
   * Rapprochement mensuel : l'état de stock des Belles Lettres, titre par titre,
   * face à ce qu'AGONE sait des sorties (commandes du site, réassorts de dépôts).
   * Ce qui reste est l'écart à qualifier : service de presse, pilon, perte.
   */
  import { goto } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  let { data, form } = $props();
  $effect(() => { if (form?.error) toast.error(form.error); });
  let ecartsSeuls = $state(true);
  const r = $derived(data.rapprochement);
  const lignes = $derived(r ? (ecartsSeuls ? r.lignes.filter((l) => l.reste || l.controle || l.inventory) : r.lignes) : []);
  /** Ligne dont on ouvre la qualification. */
  let ouverte = $state<string | null>(null);
  const kinds = $derived(Object.entries(data.kinds) as [string, string][]);
  const chips = (q: Record<string, number | undefined>) => Object.entries(q).filter(([, n]) => n).map(([k, n]) => `${data.kinds[k as keyof typeof data.kinds] ?? k} ${n}`).join(' · ');
  const moisFr = (s: string) => { const [y, m] = s.split('-'); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); };
  const n = (v: number) => (v ? String(v) : '');
  const signe = (v: number) => (v > 0 ? `+${v}` : v < 0 ? String(v) : '');
  const cls = (v: number) => (v > 0 ? 'text-warning font-medium' : v < 0 ? 'text-destructive font-medium' : 'text-muted-foreground');
</script>

<svelte:head><title>Rapprochement · Admin Agone</title></svelte:head>

<div class="mb-5 flex flex-wrap items-end justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">Rapprochement du stock Belles Lettres</h2>
    <p class="max-w-3xl text-sm text-muted-foreground">
      Pour chaque titre : stock début + entrées (réimpressions) − sorties − ventes nettes + inventaire BLDD = stock fin.
      Les sorties connues d'AGONE sont les commandes papier du site et les réassorts de dépôts commandés ; le reste est à qualifier (service de presse, pilon, perte).
    </p>
  </div>
  <div class="flex items-center gap-3">
    <select value="{data.annee}-{String(data.mois).padStart(2, '0')}" onchange={(e) => goto(`/admin/droits/rapprochement?mois=${e.currentTarget.value}`)} class="h-10 rounded-md border border-border bg-background px-3 text-sm">
      {#each data.choix as c (c)}<option value={c}>{moisFr(c)}</option>{/each}
    </select>
    <label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={ecartsSeuls} class="size-4 accent-foreground" /> Écarts seulement</label>
  </div>
</div>

{#if data.erreur}
  <div class="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">Impossible de lire l'état mensuel chez Les Belles Lettres : {data.erreur}</div>
{:else if r}
  <div class="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
    {#each [
      { l: 'Ventes nettes', v: r.totaux.net_sales, d: `${r.totaux.gross_sales} vendus, ${r.totaux.returns} retours` },
      { l: 'Sorties BLDD', v: r.totaux.exits, d: `dont ${r.totaux.vpc} VPC et ${r.totaux.depots} dépôts connus` },
      { l: 'Reste à qualifier', v: r.totaux.reste, d: r.totaux.ecart_sorties !== r.totaux.reste ? `sur ${r.totaux.ecart_sorties} d'écart · ${chips(r.totaux.qualifie)}` : `écart de sorties : SP, pilon, perte…` },
      { l: 'Réimpressions', v: r.totaux.entries, d: 'entrées du mois' },
      { l: 'Inventaire BLDD', v: r.totaux.inventory, d: 'corrections du distributeur' }
    ] as t (t.l)}
      <div class="rounded-lg border border-border bg-card p-4">
        <div class="text-xs uppercase tracking-wide text-muted-foreground">{t.l}</div>
        <div class="mt-1 font-display text-2xl font-bold">{t.v}</div>
        <div class="text-xs text-muted-foreground">{t.d}</div>
      </div>
    {/each}
  </div>

  <div class="overflow-x-auto rounded-lg border border-border bg-card">
    <table class="w-full text-sm">
      <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
        <tr>
          <th class="px-3 py-2 font-medium">Titre</th>
          <th class="px-2 py-2 text-right font-medium">Début</th>
          <th class="px-2 py-2 text-right font-medium" title="Réimpressions">Entrées</th>
          <th class="px-2 py-2 text-right font-medium" title="Exemplaires sortis sans vente chez BLDD">Sorties</th>
          <th class="px-2 py-2 text-right font-medium" title="Commandes papier du site sur le mois">VPC</th>
          <th class="px-2 py-2 text-right font-medium" title="Réassorts de dépôts commandés">Dépôts</th>
          <th class="px-2 py-2 text-right font-medium" title="Sorties − VPC − dépôts − qualifié">Reste</th>
          <th class="px-2 py-2 text-right font-medium">Ventes nettes</th>
          <th class="px-2 py-2 text-right font-medium" title="Correction d'inventaire du distributeur">Inv.</th>
          <th class="px-2 py-2 text-right font-medium">Fin</th>
          <th class="px-2 py-2 text-right font-medium" title="Début + entrées − sorties − ventes + inventaire − fin">Contrôle</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        {#each lignes as l (l.ean)}
          <tr class="hover:bg-muted/30">
            <td class="px-3 py-1.5">
              {#if l.slug}<a href="/admin/catalogue/{l.slug}" class="hover:text-link">{l.title}</a>{:else}<span>{l.title}</span> <span class="text-xs text-destructive">hors catalogue</span>{/if}
              <div class="text-xs text-muted-foreground">{#if l.author}{l.author} · {/if}<span class="font-mono">{l.ean}</span>{#if Object.keys(l.qualifie).length} · <span class="text-foreground">{chips(l.qualifie)}</span>{/if}</div>
              {#if ouverte === l.ean && l.book_id}
                <form method="POST" action="?/qualifier" use:enhance class="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <input type="hidden" name="book" value={l.book_id} /><input type="hidden" name="annee" value={r.annee} /><input type="hidden" name="mois" value={r.mois} />
                  <select name="kind" class="h-8 rounded-md border border-border bg-background px-2">{#each kinds as [k, nom] (k)}<option value={k}>{nom}</option>{/each}</select>
                  <input type="number" name="qty" step="1" value={l.reste} class="h-8 w-20 rounded-md border border-border bg-background px-2 text-right" />
                  <input name="note" placeholder="note" class="h-8 w-40 rounded-md border border-border bg-background px-2" />
                  <button type="submit" class="h-8 rounded-md bg-foreground px-3 font-medium text-background">Qualifier</button>
                  <span class="text-muted-foreground">0 retire la nature choisie</span>
                </form>
              {/if}
            </td>
            <td class="px-2 py-1.5 text-right">{l.stock_start}</td>
            <td class="px-2 py-1.5 text-right text-success">{n(l.entries)}</td>
            <td class="px-2 py-1.5 text-right">{n(l.exits)}</td>
            <td class="px-2 py-1.5 text-right text-muted-foreground">{n(l.vpc)}</td>
            <td class="px-2 py-1.5 text-right text-muted-foreground">{n(l.depots)}</td>
            <td class="px-2 py-1.5 text-right">
              {#if l.book_id && (l.reste || Object.keys(l.qualifie).length)}
                <button type="button" onclick={() => (ouverte = ouverte === l.ean ? null : l.ean)} class="{cls(l.reste)} underline-offset-4 hover:underline" title="Qualifier cet écart">{l.reste ? signe(l.reste) : '0'}</button>
              {:else}<span class={cls(l.reste)}>{signe(l.reste)}</span>{/if}
            </td>
            <td class="px-2 py-1.5 text-right font-medium">{l.net_sales}</td>
            <td class="px-2 py-1.5 text-right {cls(l.inventory)}">{signe(l.inventory)}</td>
            <td class="px-2 py-1.5 text-right">{l.stock_end}</td>
            <td class="px-2 py-1.5 text-right {l.controle ? 'text-destructive font-medium' : 'text-success'}">{l.controle ? signe(l.controle) : '✓'}</td>
          </tr>
        {/each}
        {#if lignes.length === 0}
          <tr><td colspan="11" class="px-3 py-8 text-center text-muted-foreground">Aucun écart ce mois-ci.</td></tr>
        {/if}
      </tbody>
      <tfoot class="border-t border-border bg-muted/30 font-medium">
        <tr>
          <td class="px-3 py-2">{r.lignes.length} titres{#if r.inconnus} · <span class="text-destructive">{r.inconnus} hors catalogue</span>{/if}</td>
          <td class="px-2 py-2 text-right">{r.totaux.stock_start}</td>
          <td class="px-2 py-2 text-right">{r.totaux.entries}</td>
          <td class="px-2 py-2 text-right">{r.totaux.exits}</td>
          <td class="px-2 py-2 text-right">{r.totaux.vpc}</td>
          <td class="px-2 py-2 text-right">{r.totaux.depots}</td>
          <td class="px-2 py-2 text-right {cls(r.totaux.reste)}">{signe(r.totaux.reste)}</td>
          <td class="px-2 py-2 text-right">{r.totaux.net_sales}</td>
          <td class="px-2 py-2 text-right">{signe(r.totaux.inventory)}</td>
          <td class="px-2 py-2 text-right">{r.totaux.stock_end}</td>
          <td class="px-2 py-2 text-right">{r.totaux.controle ? signe(r.totaux.controle) : '✓'}</td>
        </tr>
      </tfoot>
    </table>
  </div>
{/if}
