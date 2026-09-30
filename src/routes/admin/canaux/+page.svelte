<script lang="ts">
  /**
   * Canaux de vente : deux familles, autant de canaux qu'on veut. Chaque canal
   * dit d'où viennent ses chiffres (API branchée, API en veille, ou tableur
   * importé) et se coupe d'un commutateur.
   */
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { Plus, PencilSimple, Trash, FileArrowUp, Plugs, PlugsConnected, HandPointing } from 'phosphor-svelte';

  let { data, form } = $props();
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const lbl = 'mb-1 block text-xs font-medium text-muted-foreground';

  const FAMILLES: { id: 'direct' | 'indirect'; nom: string; desc: string }[] = [
    { id: 'direct', nom: 'Vente directe', desc: 'Ce qu’Agone vend lui-même : le site, le comptoir, la correspondance.' },
    { id: 'indirect', nom: 'Vente indirecte', desc: 'Ce que d’autres vendent pour Agone : distributeur, diffuseur, places de marché.' }
  ];
  const CONNECTEURS: Record<string, string> = { orders: 'Commandes du site', bldd: 'Extranet Belles Lettres', sumup: 'Terminal SumUp' };
  const parFamille = (f: string) => data.canaux.filter((c) => c.family === f);

  /** Bascules en cours : la ligne change tout de suite, la base suit. */
  let enCours = $state<Record<string, boolean>>({});
  /** Canal en édition (code), 'nouveau', ou null. */
  let edition = $state<string | null>(null);
  const enEdition = $derived(edition && edition !== 'nouveau' ? data.canaux.find((c) => c.code === edition) ?? null : null);
  // Champs pilotés pour que le formulaire s'adapte (mode, connecteur).
  let mode = $state('api');
  let connector = $state('');
  /** Accordéon : ouvre la fiche demandée, ou la referme si elle l'est déjà. */
  function ouvrir(code: string | null) {
    edition = edition === code ? null : code;
    const c = edition && edition !== 'nouveau' ? data.canaux.find((x) => x.code === edition) : null;
    mode = c?.mode ?? 'api';
    connector = c?.connector ?? '';
  }
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR') : '');

  const etat = (c: any) =>
    !c.enabled ? { texte: 'Désactivé', cls: 'bg-muted text-muted-foreground' }
    : c.mode === 'manuel' ? { texte: 'Manuel', cls: 'bg-accent text-accent-foreground' }
    : c.connector ? { texte: 'API branchée', cls: 'bg-success/15 text-success' }
    : { texte: 'API en veille', cls: 'bg-warning/15 text-warning' };
</script>

<svelte:head><title>Canaux de vente · Admin</title></svelte:head>

<div class="mb-5 flex flex-wrap items-end justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">Canaux de vente</h2>
    <p class="text-sm text-muted-foreground">
      D’où viennent les chiffres, et lesquels compter. Un canal désactivé garde ses relevés passés mais ne se propose plus.
    </p>
  </div>
  <Button onclick={() => { ouvrir('nouveau'); setTimeout(() => document.getElementById('nouveau-canal')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })); }}><Plus size={16} /> Nouveau canal</Button>
</div>

{#if form?.error}<p class="mb-4 rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}


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
                {:else if c.connector}<PlugsConnected size={14} /> {CONNECTEURS[c.connector] ?? c.connector}
                {:else}<Plugs size={14} /> API à développer{/if}
              </span>
            </td>
            <td class="px-2 py-2.5"><span class="whitespace-nowrap rounded px-2 py-0.5 text-xs {e.cls}">{e.texte}</span></td>
            <td class="px-2 py-2.5 text-xs text-muted-foreground">
              {#if r}{r.n} relevé{r.n > 1 ? 's' : ''}{r.dernier ? ` · jusqu’au ${dateFr(r.dernier)}` : ''}{:else}aucun relevé{/if}
            </td>
            <td class="px-2 py-2.5" onclick={(e: Event) => e.stopPropagation()}>
              <!-- Commutateur activé / désactivé -->
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
            </td>
            <td class="whitespace-nowrap px-4 py-2.5 text-right" onclick={(e: Event) => e.stopPropagation()}>
              {#if c.mode === 'manuel' && actif}
                <a href="/admin/canaux/{c.code}/import" class="mr-3 inline-flex items-center gap-1 text-xs text-link hover:underline"><FileArrowUp size={14} /> Importer un relevé</a>
              {/if}
              <button type="button" class="mr-2 {edition === c.code ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}" aria-label="Modifier" aria-expanded={edition === c.code} onclick={() => ouvrir(c.code)}><PencilSimple size={15} /></button>
              <form method="POST" action="?/delete" use:enhance class="inline" onsubmit={(ev: Event) => { if (!confirm(`Supprimer le canal « ${c.name} » ?`)) ev.preventDefault(); }}>
                <input type="hidden" name="code" value={c.code} />
                <button type="submit" class="text-muted-foreground hover:text-destructive" aria-label="Supprimer"><Trash size={15} /></button>
              </form>
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
      {#if edition === 'nouveau'}<h3 class="eyebrow mb-3">Nouveau canal</h3>{/if}
      {#if enEdition}<input type="hidden" name="existing" value={enEdition.code} />{/if}
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label class={lbl}>Nom <input name="name" required value={enEdition?.name ?? ''} placeholder="ex. Hobo Diffusion" class={input} /></label>
        <label class={lbl} title="Clé stable des relevés : lettres, chiffres, tirets bas. Déduite du nom si vide.">Code
          <input name="code" value={enEdition?.code ?? ''} placeholder="déduit du nom" class="{input} font-mono" disabled={!!enEdition} />
        </label>
        <label class={lbl}>Famille
          <select name="family" class={input}>
            {#each FAMILLES as f (f.id)}<option value={f.id} selected={(enEdition?.family ?? 'direct') === f.id}>{f.nom}</option>{/each}
          </select>
        </label>
        <label class={lbl}>Couleur (statistiques)
          <input name="color" type="color" value={enEdition?.color ?? '#7a7a7a'} class="h-10 w-full cursor-pointer rounded-md border border-border bg-background px-1" />
        </label>
        <label class={lbl}>Source des chiffres
          <select name="mode" bind:value={mode} class={input}>
            <option value="api">API — le site les tient ou va les chercher</option>
            <option value="manuel">Manuel — tableur importé</option>
          </select>
        </label>
        {#if mode === 'api'}
          <label class={lbl}>Connecteur
            <select name="connector" bind:value={connector} class={input}>
              <option value="">Aucun pour l’instant — en veille</option>
              <option value="orders">Commandes du site (order.channel)</option>
              <option value="bldd">Extranet Belles Lettres</option>
            </select>
          </label>
          {#if connector === 'orders'}
            <label class={lbl} title="Valeur de order.channel à lire">Canal des commandes
              <input name="order_channel" value={enEdition?.order_channel ?? ''} placeholder="ex. comptoir" class="{input} font-mono" />
            </label>
          {/if}
        {/if}
          <label class="{lbl} sm:col-span-2 lg:col-span-4">Notes <input name="notes" value={enEdition?.notes ?? ''} class={input} /></label>
      </div>
      <div class="mt-4">
        <Button type="submit" size="sm">Enregistrer</Button>
      </div>
    </form>
{/snippet}
