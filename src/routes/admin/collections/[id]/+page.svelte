<script lang="ts">
  import { enhance } from '$app/forms';
  import RichEditor from '$lib/components/RichEditor.svelte';
  import { Button } from '$lib/components/ui/button';
  import { isForthcoming, bookStateLabel } from '$lib/labels';
  import { ArrowLeft, FloppyDisk, Trash, Eye, Warning, Plus, Spinner } from 'phosphor-svelte';

  let { data, form } = $props();
  const c = $derived(data.collection);
  const hasBooks = $derived((c?.book_count ?? 0) > 0);

  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const label = 'mb-1 block text-sm font-medium';
  let showDelete = $state(false);
  let dirty = $state(false);
  let saving = $state(false);

  const stateClass = (b: { status?: string; published_at?: string }) =>
    isForthcoming(b) ? 'text-warning' : b.status === 'published' ? 'text-success' : 'text-muted-foreground';
</script>

<svelte:head><title>{data.isNew ? 'Nouvelle collection' : c?.name} · Admin</title></svelte:head>

<a href="/admin/collections" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
  <ArrowLeft size={16} /> Collections
</a>

<form method="POST" action="?/save" use:enhance={() => { saving = true; return async ({ update }) => { await update({ reset: false }); dirty = false; saving = false; }; }} oninput={() => (dirty = true)} onchange={() => (dirty = true)} class="max-w-3xl pb-24">
  <h2 class="mb-4 text-xl font-bold">{data.isNew ? 'Nouvelle collection' : c?.name}</h2>

  {#if form?.error}<p class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}

  <div class="space-y-5">
    <div class="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
      <label class={label}>Nom <input name="name" value={c?.name ?? ''} class={input} /></label>
      <label class={label}>Slug (URL) <input name="slug" value={c?.slug ?? ''} placeholder="auto depuis le nom" class={input} /></label>
    </div>

    <div class="rounded-lg border border-border bg-card p-4">
      <span class={label}>Description</span>
      {#key c?.id}<RichEditor name="description" value={c?.description ?? ''} minHeight="10rem" onchange={() => (dirty = true)} />{/key}
    </div>
  </div>

  <div class="fixed bottom-6 right-6 z-40">
    {#if saving}
      <Button type="submit" variant="brand" disabled class="shadow-2xl"><Spinner size={16} class="animate-spin" /> Enregistrement…</Button>
    {:else if data.isNew || dirty}
      <Button type="submit" variant="brand" class="shadow-2xl"><FloppyDisk size={16} /> Enregistrer</Button>
    {:else if c?.slug}
      <Button href="/collections/{c.slug}" target="_blank" variant="outline" class="bg-background shadow-2xl"><Eye size={16} /> Voir en ligne</Button>
    {/if}
  </div>
</form>

{#if !data.isNew}
  <div class="mt-8 max-w-3xl">
    <div class="mb-2 flex items-center justify-between">
      <h3 class="text-sm font-semibold">Livres de la collection <span class="font-normal text-muted-foreground">({data.books.length})</span></h3>
      <a href="/admin/catalogue/nouveau" class="inline-flex items-center gap-1 text-sm text-link hover:underline"><Plus size={14} /> Ajouter</a>
    </div>
    {#if data.books.length === 0}
      <p class="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Aucun livre dans cette collection.</p>
    {:else}
      <div class="overflow-hidden rounded-lg border border-border bg-card">
        <ul class="divide-y divide-border">
          {#each data.books as b (b.id)}
            <li class="flex items-center gap-3 px-3 py-2">
              <a href="/admin/catalogue/{b.id}" class="h-12 w-9 shrink-0 overflow-hidden rounded border border-border bg-muted">
                {#if b.cover_url}<img src={b.cover_url} alt="" class="size-full object-cover" />{/if}
              </a>
              <a href="/admin/catalogue/{b.id}" class="min-w-0 flex-1 font-medium hover:text-link"><span class="line-clamp-1">{b.title}</span></a>
              {#if !b.is_primary}<span class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground" title="Collection secondaire">secondaire</span>{/if}
              <span class="shrink-0 text-xs font-medium {stateClass(b)}">{bookStateLabel(b)}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>

  <div class="mt-8 max-w-3xl border-t border-border pt-4">
    {#if hasBooks}
      <p class="flex items-center gap-2 text-sm text-muted-foreground"><Warning size={15} class="text-warning" /> {c?.book_count} livre{c?.book_count > 1 ? 's' : ''} dans cette collection : suppression impossible.</p>
    {:else}
      <Button type="button" variant="ghost" size="sm" class="text-destructive hover:bg-destructive/10" onclick={() => (showDelete = true)}>
        <Trash size={15} /> Supprimer cette collection
      </Button>
    {/if}
  </div>
{/if}

{#if showDelete}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div class="w-full max-w-sm rounded-lg border border-border bg-background p-5 shadow-2xl">
      <h3 class="text-base font-semibold">Supprimer cette collection ?</h3>
      <p class="mt-1 text-sm text-muted-foreground">« {c?.name} » sera définitivement supprimée.</p>
      <div class="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onclick={() => (showDelete = false)}>Annuler</Button>
        <form method="POST" action="?/delete" use:enhance>
          <Button type="submit" size="sm" class="bg-destructive text-destructive-foreground hover:bg-destructive/90"><Trash size={15} /> Supprimer</Button>
        </form>
      </div>
    </div>
  </div>
{/if}
