<script lang="ts">
  /**
   * Combobox à choix unique, avec saisie. Deux sources :
   *  - `options` : liste locale filtrée à la frappe (insensible aux accents) ;
   *  - `searchUrl` : recherche distante (`?q=`), réponse [{ id, <labelField> }].
   * La valeur choisie est aussi postée via un input caché si `name` est fourni.
   */
  import { deburr } from '$lib/text';
  import { MagnifyingGlass, X } from 'phosphor-svelte';

  interface Opt { id: string; label: string; hint?: string }
  let {
    value = $bindable(null),
    options,
    searchUrl,
    labelField = 'label',
    name,
    placeholder = 'Rechercher…',
    class: klass = '',
    onselect
  }: {
    value?: Opt | null;
    options?: Opt[];
    searchUrl?: string;
    labelField?: string;
    name?: string;
    placeholder?: string;
    class?: string;
    onselect?: (v: Opt | null) => void;
  } = $props();

  const uid = $props.id();
  let q = $state('');
  let ouvert = $state(false);
  let actif = $state(0);
  let distants = $state<Opt[]>([]);
  let timer: ReturnType<typeof setTimeout>;

  const resultats = $derived.by(() => {
    if (!options) return distants;
    const a = deburr(q.trim());
    return (a ? options.filter((o) => deburr(o.label).includes(a)) : options).slice(0, 50);
  });

  function saisie() {
    ouvert = true;
    actif = 0;
    if (options || !searchUrl) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (q.trim().length < 2) { distants = []; return; }
      try {
        const r = await fetch(`${searchUrl}?q=${encodeURIComponent(q)}`);
        const raw = r.ok ? await r.json() : [];
        distants = raw.map((x: any) => ({ id: String(x.id), label: x[labelField] ?? x.label ?? '—' }));
      } catch { distants = []; }
    }, 200);
  }
  function choisir(o: Opt | null) {
    value = o;
    q = '';
    ouvert = false;
    onselect?.(o);
  }
  function clavier(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); ouvert = true; actif = Math.min(actif + 1, resultats.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); actif = Math.max(actif - 1, 0); }
    else if (e.key === 'Enter' && ouvert && resultats[actif]) { e.preventDefault(); choisir(resultats[actif]); }
    else if (e.key === 'Escape') ouvert = false;
  }
</script>

{#if name}<input type="hidden" {name} value={value?.id ?? ''} />{/if}

<div class="relative {klass}">
  {#if value}
    <div class="flex h-10 items-center gap-2 rounded-md border border-foreground bg-background pl-3 pr-1 text-sm">
      <span class="min-w-0 flex-1 truncate font-medium">{value.label}</span>
      <button type="button" onclick={() => choisir(null)} class="grid size-7 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Retirer {value.label}"><X size={14} /></button>
    </div>
  {:else}
    <MagnifyingGlass size={15} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input
      bind:value={q}
      oninput={saisie}
      onfocus={() => (ouvert = true)}
      onblur={() => setTimeout(() => (ouvert = false), 150)}
      onkeydown={clavier}
      {placeholder}
      autocomplete="off"
      role="combobox"
      aria-controls="{uid}-liste"
      aria-expanded={ouvert && resultats.length > 0}
      aria-autocomplete="list"
      class="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
    />
    {#if ouvert && resultats.length}
      <ul class="absolute z-30 mt-1 max-h-72 w-full min-w-56 overflow-auto rounded-md border border-border bg-background py-1 text-foreground shadow-lg" role="listbox" id="{uid}-liste">
        {#each resultats as o, i (o.id)}
          <li role="option" aria-selected={i === actif}>
            <button type="button" onmousedown={(e) => e.preventDefault()} onclick={() => choisir(o)} onmouseenter={() => (actif = i)}
              class="flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left text-sm {i === actif ? 'bg-muted' : ''}">
              <span class="min-w-0">{o.label}</span>
              {#if o.hint}<span class="shrink-0 text-xs text-muted-foreground">{o.hint}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>
