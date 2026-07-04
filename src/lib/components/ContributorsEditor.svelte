<script lang="ts">
  import { ROLE_LABEL } from '$lib/labels';
  import { MagnifyingGlass, X, DotsSixVertical } from 'phosphor-svelte';

  interface Row { authorId: string; authorName: string; role: string; share: number }
  let { initial = [] }: { initial?: Row[] } = $props();

  let rows = $state<Row[]>([]);
  $effect(() => { rows = (initial ?? []).map((r) => ({ ...r, share: r.share ?? 100 })); });
  let q = $state('');
  let results = $state<{ id: string; full_name: string }[]>([]);
  let open = $state(false);
  let timer: ReturnType<typeof setTimeout>;

  const ROLES = ['author', 'editor', 'translator', 'preface', 'postface', 'illustrator', 'other'];

  function onInput() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (q.trim().length < 2) { results = []; open = false; return; }
      const res = await fetch(`/api/authors/search?q=${encodeURIComponent(q)}`);
      results = res.ok ? await res.json() : [];
      open = results.length > 0;
    }, 220);
  }
  function add(a: { id: string; full_name: string }) {
    if (!rows.some((r) => r.authorId === a.id)) rows = [...rows, { authorId: a.id, authorName: a.full_name, role: 'author', share: 100 }];
    q = ''; results = []; open = false;
  }
  const remove = (i: number) => (rows = rows.filter((_, j) => j !== i));

  const serialized = $derived(
    JSON.stringify(rows.map((r) => ({ authorId: r.authorId, role: r.role, share: Number(r.share) || 0 })))
  );
</script>

<input type="hidden" name="contributors" value={serialized} />

<div class="space-y-2">
  {#each rows as row, i (row.authorId)}
    <div class="flex items-center gap-2 rounded-md border border-border bg-background p-2">
      <DotsSixVertical size={16} class="text-muted-foreground" />
      <span class="min-w-0 flex-1 truncate text-sm font-medium">{row.authorName}</span>
      <select bind:value={row.role} class="h-8 rounded-md border border-border bg-background px-2 text-xs">
        {#each ROLES as r (r)}<option value={r}>{ROLE_LABEL[r]}</option>{/each}
      </select>
      <div class="flex items-center gap-1">
        <input type="number" min="0" max="100" bind:value={row.share} class="h-8 w-16 rounded-md border border-border bg-background px-2 text-xs" />
        <span class="text-xs text-muted-foreground">%</span>
      </div>
      <button type="button" onclick={() => remove(i)} class="grid size-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-destructive" aria-label="Retirer">
        <X size={14} />
      </button>
    </div>
  {/each}

  {#if rows.length === 0}
    <p class="text-sm text-muted-foreground">Aucun contributeur. Recherchez un auteur ci-dessous.</p>
  {/if}

  <!-- Recherche -->
  <div class="relative">
    <MagnifyingGlass size={16} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input
      bind:value={q}
      oninput={onInput}
      onfocus={() => (open = results.length > 0)}
      placeholder="Ajouter un contributeur (nom de l’auteur)…"
      class="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm outline-none focus:border-primary"
    />
    {#if open}
      <ul class="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover shadow-lg">
        {#each results as a (a.id)}
          <li>
            <button type="button" onclick={() => add(a)} class="block w-full px-3 py-2 text-left text-sm hover:bg-muted">{a.full_name}</button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  <p class="text-xs text-muted-foreground">Le rôle et le % de part servent au calcul futur des droits d’auteur.</p>
</div>
