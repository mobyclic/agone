<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, FloppyDisk, Trash, Eye, Spinner } from 'phosphor-svelte';

  let { data, form } = $props();
  const r = $derived(data.rubrique);
  let dirty = $state(false);
  let saving = $state(false);
  let showDelete = $state(false);

  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const label = 'mb-1 block text-sm font-medium';
</script>

<svelte:head><title>{data.isNew ? 'Nouvelle catégorie' : r?.name} · Admin</title></svelte:head>

<a href="/admin/categories" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
  <ArrowLeft size={16} /> Catégories
</a>

<form method="POST" action="?/save" use:enhance={() => { saving = true; return async ({ update }) => { await update({ reset: false }); dirty = false; saving = false; }; }} oninput={() => (dirty = true)} onchange={() => (dirty = true)} class="max-w-2xl pb-24">
  <h2 class="mb-4 text-xl font-bold">{data.isNew ? 'Nouvelle catégorie' : r?.name}</h2>
  {#if form?.error}<p class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}

  <div class="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
    <label class={label}>Nom <input name="name" value={r?.name ?? ''} class={input} /></label>
    <label class={label}>Slug (URL) <input name="slug" value={r?.slug ?? ''} placeholder="auto depuis le nom" class={input} /></label>
  </div>
  {#if !data.isNew}<p class="mt-2 text-xs text-muted-foreground">{r?.article_count ?? 0} article{(r?.article_count ?? 0) > 1 ? 's' : ''} dans cette catégorie.</p>{/if}

  <div class="fixed bottom-6 right-6 z-40">
    {#if saving}
      <Button type="submit" variant="brand" disabled class="shadow-2xl"><Spinner size={16} class="animate-spin" /> Enregistrement…</Button>
    {:else if data.isNew || dirty}
      <Button type="submit" variant="brand" class="shadow-2xl"><FloppyDisk size={16} /> Enregistrer</Button>
    {:else if r?.slug}
      <Button href="/antichambre?rubrique={r.slug}" target="_blank" variant="outline" class="bg-background shadow-2xl"><Eye size={16} /> Voir en ligne</Button>
    {/if}
  </div>
</form>

{#if !data.isNew}
  <div class="mt-8 max-w-2xl border-t border-border pt-4">
    <Button type="button" variant="ghost" size="sm" class="text-destructive hover:bg-destructive/10" onclick={() => (showDelete = true)}>
      <Trash size={15} /> Supprimer cette catégorie
    </Button>
  </div>
{/if}

{#if showDelete}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div class="w-full max-w-sm rounded-lg border border-border bg-background p-5 shadow-2xl">
      <h3 class="text-base font-semibold">Supprimer cette catégorie ?</h3>
      <p class="mt-1 text-sm text-muted-foreground">« {r?.name} » sera supprimée. Les articles associés seront simplement détachés (non supprimés).</p>
      <div class="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onclick={() => (showDelete = false)}>Annuler</Button>
        <form method="POST" action="?/delete" use:enhance>
          <Button type="submit" size="sm" class="bg-destructive text-destructive-foreground hover:bg-destructive/90"><Trash size={15} /> Supprimer</Button>
        </form>
      </div>
    </div>
  </div>
{/if}
