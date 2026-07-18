<script lang="ts">
  import { enhance } from '$app/forms';
  import RichEditor from '$lib/components/RichEditor.svelte';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, FloppyDisk, Trash, Eye, Warning } from 'phosphor-svelte';

  let { data, form } = $props();
  const c = $derived(data.collection);
  const hasBooks = $derived((c?.book_count ?? 0) > 0);

  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const label = 'mb-1 block text-sm font-medium';
  let showDelete = $state(false);
</script>

<svelte:head><title>{data.isNew ? 'Nouvelle collection' : c?.name} · Admin</title></svelte:head>

<a href="/admin/collections" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
  <ArrowLeft size={16} /> Collections
</a>

<form method="POST" action="?/save" use:enhance class="max-w-3xl">
  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <h2 class="text-xl font-bold">{data.isNew ? 'Nouvelle collection' : c?.name}</h2>
    {#if !data.isNew && c?.slug}<a href="/collections/{c.slug}" target="_blank" class="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted"><Eye size={15} /> Voir</a>{/if}
  </div>

  {#if form?.error}<p class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}

  <div class="space-y-5">
    <div class="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
      <label class={label}>Nom <input name="name" value={c?.name ?? ''} class={input} /></label>
      <label class={label}>Slug (URL) <input name="slug" value={c?.slug ?? ''} placeholder="auto depuis le nom" class={input} /></label>
    </div>

    <div class="rounded-lg border border-border bg-card p-4">
      <span class={label}>Description</span>
      {#key c?.id}<RichEditor name="description" value={c?.description ?? ''} minHeight="10rem" />{/key}
    </div>
  </div>

  <div class="fixed bottom-6 right-6 z-40">
    <Button type="submit" variant="brand" class="shadow-2xl"><FloppyDisk size={16} /> Enregistrer</Button>
  </div>
</form>

{#if !data.isNew}
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
