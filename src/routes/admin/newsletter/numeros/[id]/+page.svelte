<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import RichEditor from '$lib/components/RichEditor.svelte';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, FloppyDisk, Trash, Plus, DotsSixVertical, CaretUp, CaretDown, X, MagnifyingGlass, Eye, TextT, BookOpen, CalendarDots, Cursor, Image as ImageIcon } from 'phosphor-svelte';

  let { data, form } = $props();
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';

  let counter = 0;
  const nid = () => `b${++counter}`;

  type Block = Record<string, any> & { id: string; type: string };
  let title = $state(untrack(() => data.issue?.title ?? ''));
  let status = $state(untrack(() => data.issue?.status ?? 'draft'));
  let blocks = $state<Block[]>(
    untrack(() => (data.issue?.blocks ?? []).map((b: any) => ({ ...b, id: b.id || nid() })))
  );

  const TYPES = [
    { type: 'heading', label: 'Titre', icon: TextT },
    { type: 'text', label: 'Texte', icon: TextT },
    { type: 'books', label: 'Livres', icon: BookOpen },
    { type: 'events', label: 'Rencontres', icon: CalendarDots },
    { type: 'button', label: 'Bouton', icon: Cursor },
    { type: 'image', label: 'Image', icon: ImageIcon }
  ];
  const LABELS: Record<string, string> = Object.fromEntries(TYPES.map((t) => [t.type, t.label]));

  function addBlock(type: string) {
    const base: Block = { id: nid(), type };
    if (type === 'heading') base.text = '';
    else if (type === 'text') base.html = '';
    else if (type === 'books') base.books = [];
    else if (type === 'button') { base.label = ''; base.url = ''; }
    else if (type === 'image') { base.url = ''; base.href = ''; }
    blocks = [...blocks, base];
  }
  const removeBlock = (i: number) => (blocks = blocks.filter((_, j) => j !== i));
  function move(i: number, dir: -1 | 1) {
    const to = i + dir;
    if (to < 0 || to >= blocks.length) return;
    const arr = [...blocks];
    [arr[i], arr[to]] = [arr[to], arr[i]];
    blocks = arr;
  }

  // Drag & drop
  let dragIndex = $state<number | null>(null);
  function drop(to: number) {
    if (dragIndex === null || dragIndex === to) { dragIndex = null; return; }
    const arr = [...blocks];
    const [m] = arr.splice(dragIndex, 1);
    arr.splice(to, 0, m);
    blocks = arr;
    dragIndex = null;
  }

  // Recherche de livres (par bloc)
  let bookSearch = $state<Record<string, { q: string; hits: { id: string; title: string }[] }>>({});
  let btimer: ReturnType<typeof setTimeout>;
  function searchBooks(blockId: string, q: string) {
    bookSearch[blockId] = { q, hits: bookSearch[blockId]?.hits ?? [] };
    clearTimeout(btimer);
    const t = q.trim();
    if (t.length < 2) { bookSearch[blockId] = { q, hits: [] }; return; }
    btimer = setTimeout(async () => {
      const r = await fetch(`/admin/api/books?q=${encodeURIComponent(t)}`);
      bookSearch[blockId] = { q, hits: r.ok ? (await r.json()).results : [] };
    }, 200);
  }
  function addBook(block: Block, hit: { id: string; title: string }) {
    if (!block.books.some((b: any) => b.id === hit.id)) block.books = [...block.books, { id: hit.id, title: hit.title }];
    bookSearch[block.id] = { q: '', hits: [] };
  }
  const removeBook = (block: Block, idx: number) => (block.books = block.books.filter((_: any, j: number) => j !== idx));

  const blocksJson = $derived(JSON.stringify(blocks));
</script>

<svelte:head><title>{data.isNew ? 'Nouveau numéro' : title} · Newsletter</title></svelte:head>

<a href="/admin/newsletter" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
  <ArrowLeft size={16} /> Newsletter
</a>

<form
  method="POST"
  action="?/save"
  use:enhance={({ formData }) => {
    const merged = blocks.map((b) => (b.type === 'text' ? { ...b, html: String(formData.get('nl_' + b.id) ?? b.html ?? '') } : b));
    formData.set('blocks', JSON.stringify(merged));
    return async ({ update }) => update();
  }}
  class="max-w-3xl"
>
  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <h2 class="text-xl font-bold">{data.isNew ? 'Nouveau numéro' : 'Numéro de LettrInfo'}</h2>
    <div class="flex items-center gap-2">
      {#if !data.isNew}<a href="/admin/newsletter/apercu/{data.issue?.id}" target="_blank" class="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted"><Eye size={15} /> Aperçu email</a>{/if}
    </div>
  </div>

  {#if form?.error}<p class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}

  <div class="mb-5 grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-[1fr_180px]">
    <label class="block"><span class="mb-1 block text-sm font-medium">Titre du numéro</span>
      <input name="title" bind:value={title} placeholder="Un 4 juillet, il y a 250 ans [LettrInfo 26-XX]" class={input} /></label>
    <label class="block"><span class="mb-1 block text-sm font-medium">Statut</span>
      <select name="status" bind:value={status} class={input}>
        <option value="draft">Brouillon</option>
        <option value="published">Publié</option>
      </select></label>
  </div>

  <!-- Blocs -->
  <div class="space-y-3">
    {#each blocks as block, i (block.id)}
      <div
        role="listitem"
        class="rounded-lg border border-border bg-card {dragIndex === i ? 'opacity-50' : ''}"
        ondragover={(e) => e.preventDefault()}
        ondrop={() => drop(i)}
      >
        <div class="flex items-center gap-2 border-b border-border px-3 py-2">
          <button type="button" draggable="true" ondragstart={() => (dragIndex = i)} ondragend={() => (dragIndex = null)}
            class="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing" aria-label="Déplacer"><DotsSixVertical size={16} /></button>
          <span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{LABELS[block.type] ?? block.type}</span>
          <div class="ml-auto flex items-center gap-1">
            <button type="button" onclick={() => move(i, -1)} disabled={i === 0} class="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Monter"><CaretUp size={14} /></button>
            <button type="button" onclick={() => move(i, 1)} disabled={i === blocks.length - 1} class="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Descendre"><CaretDown size={14} /></button>
            <button type="button" onclick={() => removeBlock(i)} class="p-1 text-muted-foreground hover:text-destructive" aria-label="Supprimer"><Trash size={14} /></button>
          </div>
        </div>

        <div class="p-3">
          {#if block.type === 'heading'}
            <input bind:value={block.text} placeholder="Intertitre" class={input} />
          {:else if block.type === 'text'}
            <RichEditor name={'nl_' + block.id} value={block.html ?? ''} minHeight="8rem" />
          {:else if block.type === 'books'}
            <div class="relative mb-2">
              <MagnifyingGlass size={15} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={bookSearch[block.id]?.q ?? ''} oninput={(e) => searchBooks(block.id, e.currentTarget.value)} placeholder="Ajouter un livre (titre ou ISBN)…" class="{input} pl-8" />
              {#if bookSearch[block.id]?.hits?.length}
                <ul class="absolute z-10 mt-1 w-full divide-y divide-border overflow-hidden rounded-md border border-border bg-background shadow-lg">
                  {#each bookSearch[block.id].hits as h (h.id)}
                    <li><button type="button" class="block w-full truncate px-3 py-2 text-left text-sm hover:bg-muted/40" onclick={() => addBook(block, h)}>{h.title}</button></li>
                  {/each}
                </ul>
              {/if}
            </div>
            {#if block.books.length}
              <div class="flex flex-wrap gap-2">
                {#each block.books as bk, bi (bk.id)}
                  <span class="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 py-1 pl-3 pr-2 text-sm">{bk.title}<button type="button" onclick={() => removeBook(block, bi)} class="text-muted-foreground hover:text-destructive" aria-label="Retirer"><X size={13} /></button></span>
                {/each}
              </div>
            {:else}
              <p class="text-sm text-muted-foreground">Sélectionnez les livres à afficher (grille de couvertures).</p>
            {/if}
          {:else if block.type === 'events'}
            <p class="text-sm text-muted-foreground">Bloc « Prochaines rencontres » — l'agenda des rencontres à venir est inséré automatiquement.</p>
          {:else if block.type === 'button'}
            <div class="grid gap-2 sm:grid-cols-2">
              <input bind:value={block.label} placeholder="Libellé du bouton" class={input} />
              <input bind:value={block.url} placeholder="https://…" class={input} />
            </div>
          {:else if block.type === 'image'}
            <div class="grid gap-2 sm:grid-cols-2">
              <input bind:value={block.url} placeholder="URL de l'image" class={input} />
              <input bind:value={block.href} placeholder="Lien au clic (optionnel)" class={input} />
            </div>
          {/if}
        </div>
      </div>
    {/each}

    {#if blocks.length === 0}
      <p class="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Aucun bloc. Ajoutez-en un ci-dessous.</p>
    {/if}
  </div>

  <!-- Ajouter un bloc -->
  <div class="mt-4 flex flex-wrap gap-2 rounded-lg border border-dashed border-border p-3">
    <span class="self-center text-sm text-muted-foreground">Ajouter :</span>
    {#each TYPES as t (t.type)}
      <button type="button" onclick={() => addBlock(t.type)} class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:border-primary hover:bg-muted/40"><t.icon size={15} /> {t.label}</button>
    {/each}
  </div>

  <input type="hidden" name="blocks" value={blocksJson} />

  <div class="fixed bottom-6 right-6 z-40">
    <Button type="submit" variant="brand" class="shadow-2xl"><FloppyDisk size={16} /> Enregistrer</Button>
  </div>
</form>

{#if !data.isNew}
  <form method="POST" action="?/delete" use:enhance class="mt-6 max-w-3xl border-t border-border pt-4">
    <Button type="submit" variant="ghost" size="sm" class="text-destructive hover:bg-destructive/10"
      onclick={(e: Event) => { if (!confirm('Supprimer ce numéro ?')) e.preventDefault(); }}>
      <Trash size={15} /> Supprimer ce numéro
    </Button>
  </form>
{/if}
