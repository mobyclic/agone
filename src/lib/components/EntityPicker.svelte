<script lang="ts">
  import { MagnifyingGlass, X } from 'phosphor-svelte';

  interface Item { id: string; label: string; image?: string | null }
  let {
    name,
    searchUrl,
    labelField = 'label',
    initial = [],
    placeholder = 'Rechercher…',
    visuel,
    lienBase,
    onchange
  }: {
    name: string;
    searchUrl: string;
    labelField?: string;
    initial?: Item[];
    placeholder?: string;
    /** Affiche la sélection en liste illustrée : portrait rond ou couverture. */
    visuel?: 'avatar' | 'couverture';
    /** Préfixe d'URL (ex. « /admin/auteurs/ ») : le libellé devient un lien vers la fiche. */
    lienBase?: string;
    onchange?: () => void;
  } = $props();

  let items = $state<Item[]>([]);
  $effect(() => { items = (initial ?? []).filter((x) => x?.id).map((x) => ({ id: String(x.id), label: x.label, image: x.image ?? null })); });
  const nu = (id: string) => id.replace(/^[a-z_]+:/, '');
  const initiales = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  let q = $state('');
  let results = $state<Item[]>([]);
  let open = $state(false);
  let timer: ReturnType<typeof setTimeout>;

  function onInput() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (q.trim().length < 2) { results = []; open = false; return; }
      try {
        const res = await fetch(`${searchUrl}?q=${encodeURIComponent(q)}`);
        const raw = res.ok ? await res.json() : [];
        results = raw.map((r: any) => ({ id: String(r.id), label: r[labelField] ?? r.label ?? '—', image: r.image ?? null }));
        open = results.length > 0;
      } catch { results = []; open = false; }
    }, 220);
  }
  function add(it: Item) {
    if (!items.some((x) => x.id === it.id)) { items = [...items, it]; onchange?.(); }
    q = ''; results = []; open = false;
  }
  function remove(i: number) { items = items.filter((_, j) => j !== i); onchange?.(); }

  const serialized = $derived(JSON.stringify(items.map((x) => x.id)));
</script>

<input type="hidden" {name} value={serialized} />

<div class="space-y-2">
  {#snippet vignette(it: Item)}
    {#if visuel === 'couverture'}
      {#if it.image}<img src={it.image} alt="" class="h-12 w-8 shrink-0 border border-border object-cover" />{:else}<span class="h-12 w-8 shrink-0 border border-dashed border-border bg-muted"></span>{/if}
    {:else if visuel === 'avatar'}
      {#if it.image}<img src={it.image} alt="" class="size-9 shrink-0 rounded-full border border-border object-cover" />{:else}<span class="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">{initiales(it.label)}</span>{/if}
    {/if}
  {/snippet}

  {#if items.length && visuel}
    <ul class="space-y-1.5">
      {#each items as it, i (it.id)}
        <li class="flex items-center gap-2.5 rounded-md border border-border bg-background p-1.5 pr-1">
          {@render vignette(it)}
          {#if lienBase}
            <a href="{lienBase}{nu(it.id)}" class="min-w-0 flex-1 truncate text-sm font-medium hover:text-link">{it.label}</a>
          {:else}
            <span class="min-w-0 flex-1 truncate text-sm font-medium">{it.label}</span>
          {/if}
          <button type="button" onclick={() => remove(i)} class="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-destructive" aria-label="Retirer"><X size={12} /></button>
        </li>
      {/each}
    </ul>
  {:else if items.length}
    <div class="flex flex-wrap gap-1.5">
      {#each items as it, i (it.id)}
        <span class="inline-flex items-center gap-1.5 rounded-md border border-border bg-background py-1 pl-2.5 pr-1 text-sm">
          {it.label}
          <button type="button" onclick={() => remove(i)} class="grid size-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-destructive" aria-label="Retirer"><X size={12} /></button>
        </span>
      {/each}
    </div>
  {/if}

  <div class="relative">
    <MagnifyingGlass size={16} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input bind:value={q} oninput={onInput} onfocus={() => (open = results.length > 0)} {placeholder} autocomplete="off"
      class="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm outline-none focus:border-primary" />
    {#if open}
      <ul class="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-background text-foreground shadow-lg">
        {#each results as r (r.id)}
          <li><button type="button" onclick={() => add(r)} class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted">{#if visuel}{@render vignette(r)}{/if}<span class="min-w-0 flex-1">{r.label}</span></button></li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
