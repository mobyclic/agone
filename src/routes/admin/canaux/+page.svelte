<script lang="ts">
  /**
   * Canaux de vente : deux familles, autant de canaux qu'on veut. Chaque canal
   * dit d'où viennent ses chiffres (API branchée, API en veille, ou tableur
   * importé) et se coupe d'un commutateur.
   */
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { Plus, PencilSimple, Trash, FileArrowUp, PlugsConnected, HandPointing } from 'phosphor-svelte';

  let { data, form } = $props();
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const lbl = 'mb-1 block text-xs font-medium text-muted-foreground';

  const FAMILLES: { id: 'direct' | 'indirect'; nom: string; desc: string }[] = [
    { id: 'direct', nom: 'Vente directe', desc: 'Ce qu’Agone vend lui-même : le site, le comptoir, la correspondance.' },
    { id: 'indirect', nom: 'Vente indirecte', desc: 'Ce que d’autres vendent pour Agone : distributeur, diffuseur, places de marché.' }
  ];
  const CONNECTEURS: Record<string, string> = { orders: 'Commandes du site', bldd: 'Extranet Belles Lettres' };
  const parFamille = (f: string) => data.canaux.filter((c) => c.family === f);

  /** Bascules en cours : la ligne change tout de suite, la base suit. */
  let enCours = $state<Record<string, boolean>>({});
  /** Canal en édition (code), 'nouveau', ou null. */
  let edition = $state<string | null>(null);
  const enEdition = $derived(edition && edition !== 'nouveau' ? data.canaux.find((c) => c.code === edition) ?? null : null);
  /** Accordéon : ouvre la fiche demandée, ou la referme si elle l'est déjà. */
  function ouvrir(code: string | null) {
    edition = edition === code ? null : code;
  }
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR') : '');

  const etat = (c: any) =>
    !c.enabled ? { texte: 'Masqué', cls: 'bg-muted text-muted-foreground' }
    : c.fixe ? { texte: 'Canal de la maison', cls: 'bg-success/15 text-success' }
    : { texte: 'Tableur', cls: 'bg-accent text-accent-foreground' };
</script>

<svelte:head><title>Canaux de vente · Admin</title></svelte:head>

<div class="mb-5 flex flex-wrap items-end justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">Canaux de vente</h2>
    <p class="text-sm text-muted-foreground">
      Les canaux de la maison sont fixes (couleur et notes exceptées). Un canal ajouté s’alimente par tableur ; son commutateur le montre ou
      le cache dans « Ventes par exercice » et les statistiques — sauf s’il a vendu sur l’année, auquel cas il s’affiche de toute façon.
    </p>
  </div>
  <Button onclick={() => { ouvrir('nouveau'); setTimeout(() => document.getElementById('nouveau-canal')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })); }}><Plus size={16} /> Nouveau canal</Button>
</div>



{#each FAMILLES as f (f.id)}
  <div class="mb-6 overflow-hidden rounded-lg border border-border bg-card">
    <div class="border-b border-border px-4 py-3">
      <h3 class="text-sm font-semibold">{f.nom}</h3>
      <p class="text-xs text-muted-foreground">{f.desc}</p>
    </div>
    <table class="w-full text-sm">
      <tbody class="divide-y divide-border">
        {#each parFamille(f.id) as c (c.code)}
          {@const actif = enCours[c.code] ?? c.enabled}
          {@const e = etat({ ...c, enabled: actif })}
          {@const r = data.releves[c.code]}
          <tr class="cursor-pointer hover:bg-muted/30 {actif ? '' : 'opacity-60'} {edition === c.code ? 'bg-muted/30' : ''}" onclick={() => ouvrir(c.code)}>
            <td class="w-8 px-4 py-2.5"><span class="inline-block size-3.5 rounded-sm" style="background:{c.color}"></span></td>
            <td class="px-2 py-2.5">
              <span class="font-medium">{c.name}</span>
              <span class="ml-1.5 font-mono text-xs text-muted-foreground">{c.code}</span>
              {#if c.notes}<p class="text-xs text-muted-foreground">{c.notes}</p>{/if}
            </td>
            <td class="px-2 py-2.5 text-xs text-muted-foreground">
              <span class="inline-flex items-center gap-1">
                {#if c.mode === 'manuel'}<HandPointing size={14} /> Tableur importé
                {:else}<PlugsConnected size={14} /> {CONNECTEURS[c.connector ?? ''] ?? c.connector}{/if}
              </span>
            </td>
            <td class="px-2 py-2.5"><span class="whitespace-nowrap rounded px-2 py-0.5 text-xs {e.cls}">{e.texte}</span></td>
            <td class="px-2 py-2.5 text-xs text-muted-foreground">
              {#if r}{r.n} relevé{r.n > 1 ? 's' : ''}{r.dernier ? ` · jusqu’au ${dateFr(r.dernier)}` : ''}{:else}aucun relevé{/if}
            </td>
            <td class="px-2 py-2.5" onclick={(e: Event) => e.stopPropagation()}>
              <!-- Commutateur montré / caché, pour les canaux ajoutés seulement -->
              {#if !c.fixe}
              <form method="POST" action="?/toggle" class="inline-flex" use:enhance={() => {
                enCours[c.code] = !actif;
                return async ({ update }) => { await update({ reset: false, invalidateAll: true }); delete enCours[c.code]; };
              }}>
                <input type="hidden" name="code" value={c.code} />
                <input type="hidden" name="enabled" value={actif ? 'false' : 'true'} />
                <button type="submit" role="switch" aria-checked={actif} title={actif ? 'Activé — cliquer pour désactiver' : 'Désactivé — cliquer pour activer'}
                  class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors {actif ? 'bg-success' : 'bg-muted-foreground/30'}">
                  <span class="inline-block size-4 rounded-full bg-white shadow transition-transform {actif ? 'translate-x-[18px]' : 'translate-x-0.5'}"></span>
                </button>
              </form>
              {/if}
            </td>
            <td class="whitespace-nowrap px-4 py-2.5 text-right" onclick={(e: Event) => e.stopPropagation()}>
              {#if c.mode === 'manuel' && actif}
                <a href="/admin/canaux/{c.code}/import" class="mr-3 inline-flex items-center gap-1 text-xs text-link hover:underline"><FileArrowUp size={14} /> Importer un relevé</a>
              {/if}
              <button type="button" class="mr-2 {edition === c.code ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}" aria-label="Modifier" aria-expanded={edition === c.code} onclick={() => ouvrir(c.code)}><PencilSimple size={15} /></button>
              {#if !c.fixe}
                <form method="POST" action="?/delete" use:enhance class="inline" onsubmit={(ev: Event) => { if (!confirm(`Supprimer le canal « ${c.name} » ?`)) ev.preventDefault(); }}>
                  <input type="hidden" name="code" value={c.code} />
                  <button type="submit" class="text-muted-foreground hover:text-destructive" aria-label="Supprimer"><Trash size={15} /></button>
                </form>
              {/if}
            </td>
          </tr>
          {#if edition === c.code}
            <tr><td colspan="7" class="border-t border-border p-4">{@render formulaire()}</td></tr>
          {/if}
        {/each}
        {#if parFamille(f.id).length === 0}
          <tr><td colspan="7" class="px-4 py-6 text-center text-muted-foreground">Aucun canal dans cette famille.</td></tr>
        {/if}
      </tbody>
    </table>
  </div>
{/each}

{#if edition === 'nouveau'}
  <div id="nouveau-canal" class="mb-6">{@render formulaire()}</div>
{/if}

<!-- Formulaire d'un canal : sous sa ligne pour une modification, en bas de page pour un nouveau. -->
{#snippet formulaire()}
  <form method="POST" action="?/save" use:enhance class={edition === 'nouveau' ? 'rounded-lg border border-border bg-card p-5' : ''}>
    {#if edition === 'nouveau'}<h3 class="eyebrow mb-3">Nouveau canal <span class="font-normal normal-case text-muted-foreground">— alimenté par tableur</span></h3>{/if}
    {#if enEdition}<input type="hidden" name="existing" value={enEdition.code} />{/if}
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {#if enEdition?.fixe}
        <!-- Canal de la maison : ce qui le définit se lit, ne se change pas. -->
        <div class={lbl}>Nom <p class="mt-1 text-sm text-foreground">{enEdition.name}</p></div>
        <div class={lbl}>Code <p class="mt-1 font-mono text-sm text-foreground">{enEdition.code}</p></div>
        <div class={lbl}>Source des chiffres <p class="mt-1 text-sm text-foreground">{CONNECTEURS[enEdition.connector ?? ''] ?? '—'}{enEdition.order_channel ? ` (order.channel = ${enEdition.order_channel})` : ''}</p></div>
      {:else}
        <label class={lbl}>Nom <input name="name" required value={enEdition?.name ?? ''} placeholder="ex. Hobo Diffusion" class={input} /></label>
        <label class={lbl} title="Clé stable des relevés : lettres, chiffres, tirets bas. Déduite du nom si vide.">Code
          <input name="code" value={enEdition?.code ?? ''} placeholder="déduit du nom" class="{input} font-mono" disabled={!!enEdition} />
        </label>
        <label class={lbl}>Famille
          <select name="family" class={input}>
            {#each FAMILLES as f (f.id)}<option value={f.id} selected={(enEdition?.family ?? 'indirect') === f.id}>{f.nom}</option>{/each}
          </select>
        </label>
      {/if}
      <label class={lbl}>Couleur (statistiques)
        <input name="color" type="color" value={enEdition?.color ?? '#7a7a7a'} class="h-10 w-full cursor-pointer rounded-md border border-border bg-background px-1" />
      </label>
      <label class="{lbl} sm:col-span-2 lg:col-span-4">Notes <input name="notes" value={enEdition?.notes ?? ''} class={input} /></label>
    </div>
    <div class="mt-4">
      <Button type="submit" size="sm">Enregistrer</Button>
    </div>
  </form>
{/snippet}
