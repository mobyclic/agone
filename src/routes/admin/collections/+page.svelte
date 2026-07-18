<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { Plus, DotsSixVertical, CaretUp, CaretDown, PencilSimple, FloppyDisk } from 'phosphor-svelte';

  let { data } = $props();

  type Row = { id: string; name: string; slug: string; sort: number; book_count: number };
  let rows = $state<Row[]>(untrack(() => [...data.collections]));
  let dirty = $state(false);

  let dragIndex = $state<number | null>(null);
  function drop(to: number) {
    if (dragIndex === null || dragIndex === to) { dragIndex = null; return; }
    const arr = [...rows];
    const [m] = arr.splice(dragIndex, 1);
    arr.splice(to, 0, m);
    rows = arr; dragIndex = null; dirty = true;
  }
  function move(i: number, dir: -1 | 1) {
    const to = i + dir;
    if (to < 0 || to >= rows.length) return;
    const arr = [...rows];
    [arr[i], arr[to]] = [arr[to], arr[i]];
    rows = arr; dirty = true;
  }
  const orderJson = $derived(JSON.stringify(rows.map((r) => r.id)));
</script>

<svelte:head><title>Collections · Admin Agone</title></svelte:head>

<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">Collections</h2>
    <p class="text-sm text-muted-foreground">Glissez pour réordonner, puis enregistrez l'ordre.</p>
  </div>
  <Button href="/admin/collections/nouvelle"><Plus size={16} /> Nouvelle collection</Button>
</div>

<div class="overflow-hidden rounded-lg border border-border bg-card">
  <ul class="divide-y divide-border">
    {#each rows as c, i (c.id)}
      <li
        class="flex items-center gap-3 px-3 py-2.5 {dragIndex === i ? 'opacity-50' : ''}"
        role="listitem"
        ondragover={(e) => e.preventDefault()}
        ondrop={() => drop(i)}
      >
        <button type="button" draggable="true" ondragstart={() => (dragIndex = i)} ondragend={() => (dragIndex = null)}
          class="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing" aria-label="Déplacer"><DotsSixVertical size={18} /></button>
        <div class="min-w-0 flex-1">
          <a href="/admin/collections/{c.id}" class="font-medium hover:text-link">{c.name}</a>
          <span class="ml-2 font-mono text-xs text-muted-foreground">/{c.slug}</span>
        </div>
        <span class="shrink-0 text-sm text-muted-foreground">{c.book_count} titre{c.book_count > 1 ? 's' : ''}</span>
        <div class="flex shrink-0 items-center gap-1">
          <button type="button" onclick={() => move(i, -1)} disabled={i === 0} class="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Monter"><CaretUp size={15} /></button>
          <button type="button" onclick={() => move(i, 1)} disabled={i === rows.length - 1} class="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Descendre"><CaretDown size={15} /></button>
          <a href="/admin/collections/{c.id}" class="p-1 text-muted-foreground hover:text-foreground" aria-label="Éditer"><PencilSimple size={15} /></a>
        </div>
      </li>
    {/each}
    {#if rows.length === 0}
      <li class="px-3 py-10 text-center text-muted-foreground">Aucune collection.</li>
    {/if}
  </ul>
</div>

{#if dirty}
  <form method="POST" action="?/reorder" use:enhance={() => async ({ update }) => { await update(); dirty = false; }} class="mt-4">
    <input type="hidden" name="order" value={orderJson} />
    <Button type="submit" variant="brand"><FloppyDisk size={16} /> Enregistrer l'ordre</Button>
  </form>
{/if}
