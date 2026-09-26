<script lang="ts">
  /**
   * Recherche globale du back-office, dans la barre haute : un numéro de
   * commande, un email, un ISBN, un titre, un nom. Ouverture au clavier avec
   * « / », navigation aux flèches, Entrée pour ouvrir, Échap pour fermer.
   */
  import { goto } from '$app/navigation';
  import { MagnifyingGlass, CircleNotch } from 'phosphor-svelte';

  let q = $state('');
  let ouvert = $state(false);
  let charge = $state(false);
  let groupes = $state<{ titre: string; items: { href: string; libelle: string; detail: string }[] }[]>([]);
  let actif = $state(-1);
  let champ = $state<HTMLInputElement>();
  let minuteur: ReturnType<typeof setTimeout>;

  const plats = $derived(groupes.flatMap((g) => g.items));

  function chercher() {
    clearTimeout(minuteur);
    const v = q.trim();
    if (v.length < 2) { groupes = []; return; }
    minuteur = setTimeout(async () => {
      charge = true;
      try { groupes = (await (await fetch(`/admin/api/recherche?q=${encodeURIComponent(v)}`)).json()).groupes ?? []; }
      catch { groupes = []; }
      charge = false;
      actif = plats.length ? 0 : -1;
      ouvert = true;
    }, 180);
  }
  function clavier(e: KeyboardEvent) {
    if (e.key === 'Escape') { ouvert = false; champ?.blur(); return; }
    if (!plats.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); actif = (actif + 1) % plats.length; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); actif = (actif - 1 + plats.length) % plats.length; }
    else if (e.key === 'Enter' && actif >= 0) { e.preventDefault(); aller(plats[actif].href); }
  }
  function aller(href: string) { ouvert = false; q = ''; groupes = []; goto(href); }
  function raccourci(e: KeyboardEvent) {
    const cible = e.target as HTMLElement | null;
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(cible?.tagName ?? '') && !cible?.isContentEditable) {
      e.preventDefault(); champ?.focus();
    }
  }
</script>

<svelte:window onkeydown={raccourci} />

<div class="relative ml-auto w-full max-w-md">
  <div class="relative">
    <MagnifyingGlass size={15} class="absolute left-3 top-1/2 -translate-y-1/2 text-background/50" />
    <input bind:this={champ} bind:value={q} oninput={chercher} onkeydown={clavier}
      onfocus={() => { if (plats.length) ouvert = true; }} onblur={() => setTimeout(() => (ouvert = false), 150)}
      placeholder="Rechercher (n° de commande, email, ISBN, titre…)  /" autocomplete="off"
      class="h-9 w-full rounded-md border border-background/20 bg-background/10 pl-9 pr-8 text-sm text-background placeholder:text-background/45 outline-none focus:border-background/50 focus:bg-background/15" />
    {#if charge}<CircleNotch size={14} class="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-background/60" />{/if}
  </div>

  {#if ouvert && q.trim().length >= 2}
    <div class="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-2xl">
      {#if plats.length === 0}
        <p class="px-4 py-3 text-sm text-muted-foreground">{charge ? 'Recherche…' : 'Rien trouvé.'}</p>
      {:else}
        {#each groupes as g (g.titre)}
          <div class="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.titre}</div>
          {#each g.items as it (it.href)}
            {@const i = plats.indexOf(it)}
            <button type="button" onmousedown={(e) => { e.preventDefault(); aller(it.href); }} onmouseenter={() => (actif = i)}
              class="flex w-full items-baseline justify-between gap-3 px-4 py-1.5 text-left text-sm {actif === i ? 'bg-muted' : 'hover:bg-muted/60'}">
              <span class="truncate">{it.libelle}</span>
              {#if it.detail}<span class="shrink-0 text-xs text-muted-foreground">{it.detail}</span>{/if}
            </button>
          {/each}
        {/each}
      {/if}
    </div>
  {/if}
</div>
