<script lang="ts">
  /**
   * Les ventes d'un canal pour un exercice : tableau paginé, triable, filtrable,
   * chaque ligne s'ouvrant pour être corrigée (lignes de relevé) ou annotée
   * (lignes de commande, qui se corrigent sur la commande elle-même).
   */
  import { CaretUp, CaretDown, CaretRight, MagnifyingGlass, CircleNotch, FloppyDisk, ArrowSquareOut } from 'phosphor-svelte';
  import { toast } from '$lib/toasts';
  import { Button } from '$lib/components/ui/button';

  let { code, annee, editable = true, onchange }: { code: string; annee: number; editable?: boolean; onchange?: () => void } = $props();

  type Tri = 'date' | 'isbn' | 'title' | 'qty' | 'montant';
  let page = $state(1);
  let tri = $state<Tri>('date');
  let dir = $state<'asc' | 'desc'>('desc');
  let q = $state('');
  let format = $state('');
  let data = $state<any>(null);
  let chargement = $state(false);
  let erreur = $state('');
  let ouverte = $state<string | null>(null);
  let brouillon = $state<any>({});
  let enregistrement = $state(false);

  let timer: ReturnType<typeof setTimeout>;
  async function charger() {
    chargement = true; erreur = '';
    const p = new URLSearchParams({ canal: code, annee: String(annee), page: String(page), tri, dir, q, format });
    try {
      const r = await fetch(`/admin/droits/ventes/api/lignes?${p}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message ?? 'Lecture impossible');
      data = await r.json();
    } catch (e) { erreur = e instanceof Error ? e.message : 'Lecture impossible'; }
    finally { chargement = false; }
  }
  // Toute variation de tri, filtre, page ou année relance la lecture ; la recherche attend qu'on finisse de taper.
  $effect(() => { void [code, annee, page, tri, dir, format]; void charger(); });
  function rechercher() { clearTimeout(timer); timer = setTimeout(() => { page = 1; void charger(); }, 250); }
  function trier(col: Tri) {
    if (tri === col) dir = dir === 'asc' ? 'desc' : 'asc';
    else { tri = col; dir = col === 'title' || col === 'isbn' ? 'asc' : 'desc'; }
    page = 1;
  }

  function ouvrir(l: any) {
    if (ouverte === l.id) { ouverte = null; return; }
    ouverte = l.id;
    brouillon = { ...l };
  }
  async function enregistrer(l: any) {
    enregistrement = true;
    const corps = l.type === 'order'
      ? { type: 'order', number: l.order_number, note: brouillon.note ?? '' }
      : { type: 'line', id: l.id, isbn: brouillon.isbn ?? '', units_sold: brouillon.units_sold, units_returned: brouillon.units_returned, units_free: brouillon.units_free,
          units_export: brouillon.units_export ?? null, gross_price: brouillon.gross_price ?? null, gross_ht: brouillon.gross_ht ?? null, net_receipt: brouillon.net_receipt ?? null, note: brouillon.note ?? '' };
    try {
      const r = await fetch('/admin/droits/ventes/api/lignes', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message ?? 'Enregistrement impossible');
      toast.success('Ligne enregistrée.');
      ouverte = null;
      await charger();
      onchange?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Enregistrement impossible'); }
    finally { enregistrement = false; }
  }

  const euros = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const dateFr = (d: string) => new Date(d).toLocaleDateString('fr-FR');
  const FORMAT: Record<string, string> = { paper: 'papier', ebook: 'numérique', souscription: 'souscription' };
  const input = 'h-8 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary';
  const lbl = 'block text-xs font-medium text-muted-foreground';
</script>

{#snippet entete(label: string, col: Tri, align = 'left')}
  <th class="px-3 py-2 font-medium" style="text-align:{align}">
    <button type="button" onclick={() => trier(col)} class="inline-flex items-center gap-1 uppercase hover:text-foreground {align === 'right' ? 'flex-row-reverse' : ''} {tri === col ? 'text-foreground' : ''}">
      {label}
      {#if tri === col}{#if dir === 'asc'}<CaretUp size={11} weight="bold" />{:else}<CaretDown size={11} weight="bold" />{/if}{:else}<CaretDown size={11} class="opacity-25" />{/if}
    </button>
  </th>
{/snippet}

<div class="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
  <div class="relative min-w-56 flex-1">
    <MagnifyingGlass size={14} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input bind:value={q} oninput={rechercher} placeholder="Titre, ISBN, n° de commande…" class="{input} pl-8" />
  </div>
  <select bind:value={format} onchange={() => (page = 1)} class="h-8 rounded-md border border-border bg-background px-2 text-sm">
    <option value="">Tous formats</option><option value="paper">Papier</option><option value="ebook">Numérique</option>
  </select>
  {#if data}
    <span class="ml-auto text-xs text-muted-foreground tabular-nums">
      {data.total.toLocaleString('fr-FR')} ligne{data.total > 1 ? 's' : ''} · {data.totaux.qty.toLocaleString('fr-FR')} ex. · {euros(data.totaux.montant)}
    </span>
  {/if}
  {#if chargement}<CircleNotch size={14} class="animate-spin text-muted-foreground" />{/if}
</div>

{#if erreur}
  <p class="px-4 py-6 text-sm text-destructive">{erreur}</p>
{:else if data}
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead class="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
        <tr>
          <th class="w-6"></th>
          {@render entete('Date', 'date')}
          {@render entete('ISBN', 'isbn')}
          {@render entete('Titre', 'title')}
          {@render entete('Qté', 'qty', 'right')}
          {@render entete('Montant', 'montant', 'right')}
          <th class="px-3 py-2 font-medium uppercase">Détail</th>
          <th class="px-3 py-2 font-medium uppercase">Commentaire</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        {#each data.rows as l (l.id)}
          <tr class="cursor-pointer hover:bg-muted/30 {ouverte === l.id ? 'bg-muted/30' : ''}" onclick={() => ouvrir(l)}>
            <td class="pl-3"><CaretRight size={11} weight="bold" class="text-muted-foreground transition-transform {ouverte === l.id ? 'rotate-90' : ''}" /></td>
            <td class="whitespace-nowrap px-3 py-2">{l.type === 'order' ? dateFr(l.date) : l.periode}</td>
            <td class="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">{l.isbn ?? '—'}</td>
            <td class="px-3 py-2">
              {#if l.title}{l.title}{:else}<span class="text-amber-700 dark:text-amber-500">livre inconnu</span>{/if}
              <span class="ml-1.5 text-xs text-muted-foreground">{FORMAT[l.format] ?? l.format}</span>
            </td>
            <td class="px-3 py-2 text-right tabular-nums {l.qty < 0 ? 'text-destructive' : ''}">{l.qty.toLocaleString('fr-FR')}</td>
            <td class="whitespace-nowrap px-3 py-2 text-right tabular-nums">{euros(l.montant)} <span class="text-[10px] uppercase text-muted-foreground">{l.montant_nature}</span></td>
            <td class="max-w-[18rem] truncate px-3 py-2 text-xs text-muted-foreground" title={l.detail}>{l.detail}</td>
            <td class="max-w-[14rem] truncate px-3 py-2 text-xs italic text-muted-foreground" title={l.note ?? ''}>{l.note ?? ''}</td>
          </tr>
          {#if ouverte === l.id}
            <tr><td colspan="8" class="bg-muted/15 px-5 py-4">
              {#if l.type === 'order'}
                <div class="flex flex-wrap items-end gap-3">
                  <p class="basis-full text-xs text-muted-foreground">
                    Ligne d’une commande du site : les quantités et le prix se corrigent sur la commande.
                    <a href="/admin/commandes/{l.order_number}" class="inline-flex items-center gap-1 text-link hover:underline">Ouvrir la commande n° {l.order_number} <ArrowSquareOut size={12} /></a>
                  </p>
                  <label class="{lbl} min-w-72 flex-1">Commentaire (note de la commande)
                    <input bind:value={brouillon.note} class="{input} mt-1" />
                  </label>
                  <Button size="sm" disabled={enregistrement} onclick={() => enregistrer(l)}><FloppyDisk size={14} /> Enregistrer</Button>
                </div>
              {:else if editable}
                <div class="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <label class={lbl}>ISBN <input bind:value={brouillon.isbn} class="{input} mt-1 font-mono" /></label>
                  <label class={lbl}>Vendus <input type="number" min="0" bind:value={brouillon.units_sold} class="{input} mt-1" /></label>
                  <label class={lbl}>Retours <input type="number" min="0" bind:value={brouillon.units_returned} class="{input} mt-1" /></label>
                  <label class={lbl}>SP / gratuits <input type="number" min="0" bind:value={brouillon.units_free} class="{input} mt-1" /></label>
                  <label class={lbl}>Hors France <input type="number" min="0" bind:value={brouillon.units_export} placeholder="—" class="{input} mt-1" /></label>
                  <label class={lbl}>Prix unitaire TTC <input type="number" step="0.01" bind:value={brouillon.gross_price} placeholder="—" class="{input} mt-1" /></label>
                  <label class={lbl}>Montant prix public HT <input type="number" step="0.01" bind:value={brouillon.gross_ht} placeholder="—" class="{input} mt-1" /></label>
                  <label class={lbl}>Net facturé HT <input type="number" step="0.01" bind:value={brouillon.net_receipt} placeholder="—" class="{input} mt-1" /></label>
                  <label class="{lbl} sm:col-span-3 lg:col-span-3">Commentaire <input bind:value={brouillon.note} placeholder="correction, source, précision…" class="{input} mt-1" /></label>
                  <div class="flex items-end lg:col-span-1"><Button size="sm" disabled={enregistrement} onclick={() => enregistrer(l)}><FloppyDisk size={14} /> Enregistrer</Button></div>
                </div>
                {#if l.report_label === 'auto'}
                  <p class="mt-2 text-xs text-muted-foreground">Ligne d’un relevé automatique : elle sera refaite si vous relancez le relevé de cette période — notez la correction dans le commentaire.</p>
                {/if}
              {/if}
            </td></tr>
          {/if}
        {/each}
        {#if data.rows.length === 0}
          <tr><td colspan="8" class="px-4 py-8 text-center text-sm text-muted-foreground">Aucune ligne{q || format ? ' pour ce filtre' : ` en ${annee}`}.</td></tr>
        {/if}
      </tbody>
    </table>
  </div>
  {#if data.pages > 1}
    <div class="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-xs text-muted-foreground">
      <span>Page {data.page} / {data.pages}</span>
      <div class="flex gap-1">
        <button type="button" class="rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-40" disabled={page <= 1} onclick={() => (page = Math.max(1, page - 1))}>Précédente</button>
        <button type="button" class="rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-40" disabled={page >= data.pages} onclick={() => (page = Math.min(data.pages, page + 1))}>Suivante</button>
      </div>
    </div>
  {/if}
{:else}
  <p class="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground"><CircleNotch size={15} class="animate-spin" /> Chargement…</p>
{/if}
