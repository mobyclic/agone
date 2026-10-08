<script lang="ts">
  /**
   * Fiche d'un dépôt : le stock confié, l'inventaire (comptage → écarts), le
   * réassort, l'import d'un carnet de vente (aperçu puis validation : relevé de
   * ventes, facture brouillon, mouvements) et l'historique.
   */
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, DownloadSimple, MagnifyingGlass, Trash, UploadSimple, Warning, Check, X } from 'phosphor-svelte';

  let { data, form } = $props();
  $effect(() => { if (form?.error) toast.error(form.error); });

  const euro = (n?: number | null) => (n != null ? `${Number(n).toFixed(2).replace('.', ',')} €` : '—');
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const input = 'h-9 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary';
  const carte = 'rounded-lg border border-border bg-card p-5';

  // ── Recherche catalogue (inventaire : titres nouveaux ; réassort) ──
  interface Livre { id: string; title: string; isbn_paper?: string; price_paper?: number }
  async function chercher(q: string): Promise<Livre[]> {
    if (q.trim().length < 2) return [];
    try { const r = await fetch(`/admin/api/books?q=${encodeURIComponent(q.trim())}`); return r.ok ? await r.json() : []; } catch { return []; }
  }
  const nu = (id: string) => String(id).replace(/^book:/, '');

  // ── Inventaire ──
  let modeInventaire = $state(false);
  let ajouts = $state<{ bookId: string; title: string; compte: number }[]>([]);
  let qInv = $state(''); let resInv = $state<Livre[]>([]);
  async function chercherInv() { resInv = (await chercher(qInv)).filter((b) => !data.stock.some((s) => s.book_id === nu(b.id)) && !ajouts.some((a) => a.bookId === nu(b.id))); }
  const ajouterInv = (b: Livre) => { ajouts = [...ajouts, { bookId: nu(b.id), title: b.title, compte: 0 }]; qInv = ''; resInv = []; };

  // ── Réassort ──
  let modeReassort = $state(false);
  let reassort = $state<{ bookId: string; title: string; qty: number }[]>([]);
  let qRea = $state(''); let resRea = $state<Livre[]>([]);
  async function chercherRea() { resRea = (await chercher(qRea)).filter((b) => !reassort.some((r) => r.bookId === nu(b.id))); }
  const ajouterRea = (b: Livre) => { reassort = [...reassort, { bookId: nu(b.id), title: b.title, qty: 10 }]; qRea = ''; resRea = []; };

  // ── Carnet ──
  const carnet = $derived(form?.carnet ?? null);
  let remiseCarnet = $state<number | null>(null);
  const remiseEffective = $derived(remiseCarnet ?? carnet?.apercu.remise ?? data.remise);
  const classeEcart = (n?: number) => (n ? (n > 0 ? 'text-warning' : 'text-destructive') : 'text-muted-foreground');
</script>

<svelte:head><title>Dépôt {data.client.name} · Admin Agone</title></svelte:head>

<a href="/admin/depots" class="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> Dépôts</a>

<div class="mb-5 flex flex-wrap items-start justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">{data.client.name}</h2>
    <p class="text-sm text-muted-foreground">
      {[data.client.contact_name, data.client.city].filter(Boolean).join(' · ')}
      · remise {data.remise} %
      · <a href="/admin/clients/pro/{data.client.id}" class="text-link underline-offset-4 hover:underline">fiche client</a>
    </p>
  </div>
  <div class="flex flex-wrap gap-2">
    <Button href="/admin/depots/{data.client.id}/carnet.xlsx" variant="outline"><DownloadSimple size={16} /> Carnet de vente vierge (xlsx)</Button>
  </div>
</div>

<div class="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <div class="space-y-5">
    <!-- ── Stock & inventaire ── -->
    <section class={carte}>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 class="eyebrow">Stock confié <span class="ml-1 normal-case tracking-normal text-muted-foreground">({data.stock.reduce((n, s) => n + Math.max(0, s.qty), 0)} ex. · {data.stock.filter((s) => s.qty > 0).length} titres)</span></h3>
        <div class="flex gap-2">
          <Button type="button" variant={modeInventaire ? 'default' : 'outline'} size="sm" onclick={() => { modeInventaire = !modeInventaire; modeReassort = false; }}>Inventaire</Button>
          <Button type="button" variant={modeReassort ? 'default' : 'outline'} size="sm" onclick={() => { modeReassort = !modeReassort; modeInventaire = false; }}>Réassort</Button>
        </div>
      </div>

      {#if modeReassort}
        <form method="POST" action="?/reassort" use:enhance class="mb-4 rounded-md border border-border bg-muted/30 p-3">
          <p class="mb-2 text-xs text-muted-foreground">Exemplaires qui entrent au dépôt (depuis Belles Lettres ou le bureau). Une quantité négative enregistre un retour.</p>
          <div class="relative">
            <MagnifyingGlass size={14} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input bind:value={qRea} oninput={chercherRea} placeholder="Ajouter un titre (titre ou ISBN)…" class="{input} w-full pl-8" />
            {#if resRea.length}
              <ul class="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-background shadow-lg">
                {#each resRea as b (b.id)}<li><button type="button" onclick={() => ajouterRea(b)} class="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted">{b.title} <span class="text-xs text-muted-foreground">{b.isbn_paper ?? ''}</span></button></li>{/each}
              </ul>
            {/if}
          </div>
          {#if reassort.length}
            <ul class="mt-2 divide-y divide-border">
              {#each reassort as r, i (r.bookId)}
                <li class="flex items-center gap-2 py-1.5 text-sm">
                  <span class="min-w-0 flex-1 truncate">{r.title}</span>
                  <input type="number" step="1" bind:value={r.qty} class="{input} w-20 text-right" />
                  <button type="button" onclick={() => (reassort = reassort.filter((_, k) => k !== i))} class="text-muted-foreground hover:text-destructive" aria-label="Retirer"><X size={14} /></button>
                </li>
              {/each}
            </ul>
          {/if}
          <input type="hidden" name="lignes" value={JSON.stringify(reassort)} />
          <div class="mt-3 flex flex-wrap items-end gap-3">
            <label class="text-xs text-muted-foreground">Date<br /><input type="date" name="at" value={aujourdhui} class={input} /></label>
            <label class="min-w-48 flex-1 text-xs text-muted-foreground">Note<br /><input name="note" placeholder="ex. réassort BLDD du 26/06" class="{input} w-full" /></label>
            <Button type="submit" size="sm" disabled={!reassort.length}><Check size={14} /> Enregistrer le réassort</Button>
          </div>
        </form>
      {/if}

      <form method="POST" action="?/inventaire" use:enhance>
        {#if modeInventaire}
          <p class="mb-2 text-xs text-muted-foreground">Saisissez le stock compté ; un titre laissé vide ne bouge pas. L'écart avec le stock attendu est enregistré comme mouvement d'inventaire.</p>
        {/if}
        <table class="w-full text-sm">
          <thead class="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th class="py-1.5 pr-2 font-medium">Titre</th>
              <th class="py-1.5 pr-2 font-medium">ISBN</th>
              <th class="py-1.5 pr-2 text-right font-medium">PPTTC</th>
              <th class="py-1.5 text-right font-medium">Stock</th>
              {#if modeInventaire}<th class="py-1.5 pl-3 text-right font-medium">Compté</th>{/if}
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            {#each data.stock as s (s.book_id)}
              {#if s.qty > 0 || modeInventaire}
                <tr class={s.qty <= 0 ? 'text-muted-foreground' : ''}>
                  <td class="py-1.5 pr-2">
                    <a href="/admin/catalogue/{s.slug ?? s.book_id}" class="hover:text-link">{s.title}</a>
                    {#if s.collection}<span class="ml-1 text-[11px] uppercase tracking-wide text-muted-foreground">{s.collection}</span>{/if}
                  </td>
                  <td class="whitespace-nowrap py-1.5 pr-2 font-mono text-xs text-muted-foreground">{s.isbn ?? '—'}</td>
                  <td class="whitespace-nowrap py-1.5 pr-2 text-right">{euro(s.price_paper)}</td>
                  <td class="py-1.5 text-right font-medium {s.qty < 0 ? 'text-destructive' : ''}">{s.qty}</td>
                  {#if modeInventaire}<td class="py-1 pl-3 text-right"><input type="number" step="1" min="0" name="compte_{s.book_id}" placeholder={String(s.qty)} class="{input} w-20 text-right" /></td>{/if}
                </tr>
              {/if}
            {/each}
            {#if modeInventaire}
              {#each ajouts as a, i (a.bookId)}
                <tr class="bg-success/5">
                  <td class="py-1.5 pr-2" colspan="3">{a.title} <span class="text-xs text-success">nouveau au dépôt</span></td>
                  <td class="py-1.5 text-right text-muted-foreground">0</td>
                  <td class="py-1 pl-3 text-right"><span class="inline-flex items-center gap-1"><input type="number" step="1" min="0" bind:value={a.compte} class="{input} w-20 text-right" /><button type="button" onclick={() => (ajouts = ajouts.filter((_, k) => k !== i))} class="text-muted-foreground hover:text-destructive" aria-label="Retirer"><X size={14} /></button></span></td>
                </tr>
              {/each}
            {/if}
            {#if data.stock.length === 0 && !modeInventaire}
              <tr><td colspan="4" class="py-6 text-center text-muted-foreground">Aucun exemplaire confié. Faites un premier inventaire ou un réassort.</td></tr>
            {/if}
          </tbody>
        </table>
        {#if modeInventaire}
          <div class="relative mt-3">
            <MagnifyingGlass size={14} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input bind:value={qInv} oninput={chercherInv} placeholder="Ajouter un titre absent de la liste…" class="{input} w-full pl-8" />
            {#if resInv.length}
              <ul class="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-background shadow-lg">
                {#each resInv as b (b.id)}<li><button type="button" onclick={() => ajouterInv(b)} class="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted">{b.title} <span class="text-xs text-muted-foreground">{b.isbn_paper ?? ''}</span></button></li>{/each}
              </ul>
            {/if}
          </div>
          <input type="hidden" name="ajouts" value={JSON.stringify(ajouts)} />
          <div class="mt-3 flex flex-wrap items-end gap-3">
            <label class="text-xs text-muted-foreground">Date de l'inventaire<br /><input type="date" name="at" value={aujourdhui} class={input} /></label>
            <label class="min-w-48 flex-1 text-xs text-muted-foreground">Note<br /><input name="note" placeholder="ex. inventaire de rentrée" class="{input} w-full" /></label>
            <Button type="submit" size="sm"><Check size={14} /> Valider l'inventaire</Button>
          </div>
        {/if}
      </form>
    </section>

    <!-- ── Carnet de vente ── -->
    <section class={carte}>
      <h3 class="eyebrow mb-1">Importer un carnet de vente</h3>
      <p class="mb-3 text-xs text-muted-foreground">
        Le tableur rempli par le dépositaire (ISBN, titre, prix, stock, CB, chèque, espèces, SP, stock fin). La validation crée en une fois
        le relevé de ventes du canal « Dépôts & salons », la facture brouillon au dépositaire et les mouvements du dépôt.
      </p>
      {#if !carnet}
        <form method="POST" action="?/carnet_lire" enctype="multipart/form-data" use:enhance class="flex flex-wrap items-center gap-3">
          <input type="file" name="fichier" accept=".xls,.xlsx,.csv" required class="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm" />
          <Button type="submit" size="sm"><UploadSimple size={14} /> Lire le fichier</Button>
        </form>
      {:else}
        <div class="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <span class="font-medium">{carnet.nomFichier}</span>
          {#if carnet.feuilles.length > 1}
            <form method="POST" action="?/carnet_relire" use:enhance class="inline-flex items-center gap-2">
              <input type="hidden" name="token" value={carnet.token} />
              <input type="hidden" name="remise" value={remiseEffective} />
              {#if carnet.apercu.alignerDebut}<input type="hidden" name="aligner" value="on" />{/if}
              <label class="text-xs text-muted-foreground">Feuille
                <select name="feuille" value={carnet.feuille} onchange={(e) => e.currentTarget.form?.requestSubmit()} class="{input} ml-1">
                  {#each carnet.feuilles as f (f)}<option value={f}>{f}</option>{/each}
                </select>
              </label>
            </form>
          {/if}
          <a href="/admin/depots/{data.client.id}" class="ml-auto text-xs text-muted-foreground hover:text-foreground">Annuler</a>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="border-b border-border text-left uppercase text-muted-foreground">
              <tr>
                <th class="py-1.5 pr-2 font-medium">Titre</th>
                <th class="py-1.5 pr-2 text-right font-medium">Prix</th>
                <th class="py-1.5 pr-2 text-right font-medium" title="Stock du dépôt dans AGONE / stock début noté sur le carnet">Stock</th>
                <th class="py-1.5 pr-2 text-right font-medium">CB</th>
                <th class="py-1.5 pr-2 text-right font-medium">Chq</th>
                <th class="py-1.5 pr-2 text-right font-medium">Esp.</th>
                <th class="py-1.5 pr-2 text-right font-medium">Vendus</th>
                <th class="py-1.5 pr-2 text-right font-medium">SP</th>
                <th class="py-1.5 pr-2 text-right font-medium" title="Stock fin compté / attendu">Fin</th>
                <th class="py-1.5 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              {#each carnet.apercu.lignes as l, i (i)}
                <tr class={!l.book_id && (l.ventes || l.sp) ? 'bg-destructive/5' : (!l.ventes && !l.sp && !l.ecart_fin ? 'text-muted-foreground' : '')}>
                  <td class="py-1 pr-2">
                    {l.titre_catalogue ?? l.titre}
                    {#if !l.book_id}<span class="ml-1 inline-flex items-center gap-0.5 text-destructive"><Warning size={11} /> ISBN {l.isbn} inconnu</span>{/if}
                  </td>
                  <td class="py-1 pr-2 text-right">{euro(l.prix_retenu)}{#if l.prix_catalogue != null && l.prix_retenu !== l.prix_catalogue}<span class="ml-1 text-warning" title="Prix du catalogue : {euro(l.prix_catalogue)}">≠</span>{/if}</td>
                  <td class="py-1 pr-2 text-right">{l.stock_actuel}{#if l.ecart_debut}<span class="ml-1 {classeEcart(l.ecart_debut)}" title="Le carnet note {l.stock_debut} au départ">({l.ecart_debut > 0 ? '+' : ''}{l.ecart_debut})</span>{/if}</td>
                  <td class="py-1 pr-2 text-right">{l.cb || ''}</td>
                  <td class="py-1 pr-2 text-right">{l.cheque || ''}</td>
                  <td class="py-1 pr-2 text-right">{l.especes || ''}</td>
                  <td class="py-1 pr-2 text-right font-medium">{l.ventes || ''}</td>
                  <td class="py-1 pr-2 text-right">{l.sp || ''}</td>
                  <td class="py-1 pr-2 text-right">{l.stock_fin ?? '—'}{#if l.ecart_fin}<span class="ml-1 {classeEcart(l.ecart_fin)}" title="Attendu : {l.stock_attendu_fin}">({l.ecart_fin > 0 ? '+' : ''}{l.ecart_fin})</span>{/if}</td>
                  <td class="py-1 text-right">{l.ventes ? euro(l.ventes * l.net_unitaire) : ''}</td>
                </tr>
              {/each}
            </tbody>
            <tfoot class="border-t border-border font-medium">
              <tr>
                <td class="py-1.5 pr-2">{carnet.apercu.lignes.length} lignes{#if carnet.apercu.inconnus} · <span class="text-destructive">{carnet.apercu.inconnus} ISBN inconnu{carnet.apercu.inconnus > 1 ? 's' : ''} (ignorés)</span>{/if}{#if carnet.apercu.ecarts} · <span class="text-warning">{carnet.apercu.ecarts} écart{carnet.apercu.ecarts > 1 ? 's' : ''} de stock</span>{/if}</td>
                <td colspan="5"></td>
                <td class="py-1.5 pr-2 text-right">{carnet.apercu.ventes}</td>
                <td class="py-1.5 pr-2 text-right">{carnet.apercu.sp}</td>
                <td class="py-1.5 pr-2 text-right text-muted-foreground">TTC {euro(carnet.apercu.ca_ttc)}</td>
                <td class="py-1.5 text-right">{euro(carnet.apercu.net_ttc)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {#if carnet.apercu.ecartsDebut || carnet.apercu.alignerDebut}
          <form method="POST" action="?/carnet_relire" use:enhance class="mt-3 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs">
            <input type="hidden" name="token" value={carnet.token} />
            <input type="hidden" name="remise" value={remiseEffective} />
            <label class="flex items-start gap-2">
              <input type="checkbox" name="aligner" checked={carnet.apercu.alignerDebut} onchange={(e) => e.currentTarget.form?.requestSubmit()} class="mt-0.5 size-4 accent-foreground" />
              <span><span class="font-medium">Prendre le stock début du carnet pour inventaire</span> — {carnet.apercu.ecartsDebut} titre{carnet.apercu.ecartsDebut > 1 ? 's' : ''} où il diffère du stock connu d'AGONE.
                L'écart est posé en mouvement d'inventaire avant les ventes ; c'est le cas normal pour un premier carnet.</span>
            </label>
          </form>
        {/if}
        <form method="POST" action="?/carnet_valider" use:enhance class="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
          <input type="hidden" name="token" value={carnet.token} />
          {#if carnet.apercu.alignerDebut}<input type="hidden" name="aligner" value="on" />{/if}
          <label class="min-w-56 flex-1 text-xs text-muted-foreground">Événement / libellé<br /><input name="label" value={carnet.feuille.replace(/^CarnetVente_?/i, '').replace(/_/g, ' ')} required class="{input} w-full" /></label>
          <label class="text-xs text-muted-foreground">Date des ventes<br /><input type="date" name="sold_at" value={aujourdhui} required class={input} /></label>
          <label class="text-xs text-muted-foreground">Remise (%)<br /><input type="number" name="remise" min="0" max="100" step="0.5" value={remiseEffective} oninput={(e) => (remiseCarnet = Number(e.currentTarget.value))} class="{input} w-24" /></label>
          <Button type="submit" size="sm" disabled={!carnet.apercu.ventes && !carnet.apercu.sp && !carnet.apercu.ecarts}><Check size={14} /> Valider : ventes, facture et stock</Button>
        </form>
        {#if remiseCarnet != null && remiseCarnet !== carnet.apercu.remise}
          <p class="mt-1 text-xs text-muted-foreground">Les montants nets ci-dessus sont calculés à {carnet.apercu.remise} % ; la facture sera établie à {remiseCarnet} %.</p>
        {/if}
      {/if}
    </section>

    <!-- ── Carnets validés ── -->
    {#if data.carnets.length}
      <section class={carte}>
        <h3 class="eyebrow mb-3">Carnets de vente</h3>
        <table class="w-full text-sm">
          <thead class="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <tr><th class="py-1.5 pr-2 font-medium">Événement</th><th class="py-1.5 pr-2 font-medium">Date</th><th class="py-1.5 pr-2 text-right font-medium">Vendus</th><th class="py-1.5 pr-2 text-right font-medium">SP</th><th class="py-1.5 pr-2 text-right font-medium">Net TTC</th><th class="py-1.5 pr-2 font-medium">Facture</th><th></th></tr>
          </thead>
          <tbody class="divide-y divide-border">
            {#each data.carnets as c (c.id)}
              <tr class={c.status === 'cancelled' ? 'text-muted-foreground line-through' : ''}>
                <td class="py-1.5 pr-2">{c.label}</td>
                <td class="py-1.5 pr-2 whitespace-nowrap">{dateFr(c.sold_at)}</td>
                <td class="py-1.5 pr-2 text-right">{c.ventes}</td>
                <td class="py-1.5 pr-2 text-right">{c.sp || ''}</td>
                <td class="py-1.5 pr-2 text-right">{euro(c.net_ttc)}</td>
                <td class="py-1.5 pr-2">{#if c.invoice_id}<a href="/admin/factures/{c.invoice_id}" class="text-link hover:underline">{c.invoice_ref ?? 'facture'}</a>{#if c.invoice_status === 'draft'}<span class="ml-1 text-xs text-muted-foreground">brouillon</span>{/if}{:else}—{/if}</td>
                <td class="py-1.5 text-right">
                  {#if c.status === 'validated'}
                    <form method="POST" action="?/carnet_annuler" use:enhance class="inline" onsubmit={(e) => { if (!confirm('Annuler ce carnet ? Le relevé de ventes et les mouvements seront retirés, la facture brouillon supprimée.')) e.preventDefault(); }}>
                      <input type="hidden" name="carnetId" value={c.id} />
                      <button type="submit" class="text-muted-foreground hover:text-destructive" title="Annuler le carnet" aria-label="Annuler le carnet"><Trash size={14} /></button>
                    </form>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/if}
  </div>

  <!-- ── Mouvements ── -->
  <aside class={carte}>
    <h3 class="eyebrow mb-3">Mouvements</h3>
    {#if data.mouvements.length === 0}
      <p class="text-sm text-muted-foreground">Aucun mouvement.</p>
    {:else}
      <ul class="divide-y divide-border text-sm">
        {#each data.mouvements as m (m.id)}
          <li class="flex items-start gap-3 py-2">
            <span class="w-14 shrink-0 text-right font-medium {m.qty < 0 ? 'text-destructive' : 'text-success'}">{m.qty > 0 ? '+' : ''}{m.qty}</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate">{m.title}</span>
              <span class="block text-xs text-muted-foreground">{data.kinds[m.kind] ?? m.kind} · {dateFr(m.at)}{#if m.carnet_label} · {m.carnet_label}{/if}{#if m.note} · {m.note}{/if}</span>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </aside>
</div>
