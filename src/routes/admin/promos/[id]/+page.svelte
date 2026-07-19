<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import EntityPicker from '$lib/components/EntityPicker.svelte';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, FloppyDisk, Trash, Spinner } from 'phosphor-svelte';

  let { data, form } = $props();
  const p = $derived(data.promo);
  let scope = $state(untrack(() => data.promo?.scope ?? 'all'));
  let type = $state(untrack(() => data.promo?.type ?? 'percent'));
  const collSet = $derived(new Set((data.promo?.collection_ids ?? []).map(String)));
  const startDate = $derived(data.promo?.starts_at ? String(data.promo.starts_at).slice(0, 10) : '');
  const endDate = $derived(data.promo?.ends_at ? String(data.promo.ends_at).slice(0, 10) : '');
  let showDelete = $state(false);
  let saving = $state(false);

  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const label = 'mb-1 block text-sm font-medium';
</script>

<svelte:head><title>{data.isNew ? 'Nouveau code' : p?.code} · Admin</title></svelte:head>

<a href="/admin/promos" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Codes promo</a>

<form method="POST" action="?/save" use:enhance={() => { saving = true; return async ({ update }) => { await update(); saving = false; }; }} class="max-w-2xl pb-24">
  <h2 class="mb-4 text-xl font-bold">{data.isNew ? 'Nouveau code promo' : p?.code}</h2>
  {#if form?.error}<p class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}

  <div class="space-y-5">
    <!-- Identité -->
    <div class="rounded-lg border border-border bg-card p-4">
      <div class="grid gap-4 sm:grid-cols-2">
        <label class={label}>Code * <input name="code" required value={p?.code ?? ''} placeholder="BIENVENUE10" class="{input} font-mono uppercase" /></label>
        <label class={label}>Description <input name="description" value={p?.description ?? ''} placeholder="Interne (facultatif)" class={input} /></label>
      </div>
      <label class="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" checked={data.isNew ? true : p?.active} class="size-4 rounded border-border" /> Actif
      </label>
      {#if !data.isNew}<p class="mt-2 text-xs text-muted-foreground">Utilisé {p?.used_count ?? 0} fois.</p>{/if}
    </div>

    <!-- Remise -->
    <div class="rounded-lg border border-border bg-card p-4">
      <h3 class="eyebrow mb-3">Remise</h3>
      <div class="grid gap-4 sm:grid-cols-3">
        <label class={label}>Type
          <select name="type" bind:value={type} class={input}>
            <option value="percent">Pourcentage (%)</option>
            <option value="amount">Montant (€)</option>
          </select>
        </label>
        <label class={label}>Valeur ({type === 'percent' ? '%' : '€'})
          <input name="value" type="number" step="0.01" min="0" value={p?.value ?? ''} class={input} />
        </label>
        <label class={label}>Commande mini (€)
          <input name="min_subtotal" type="number" step="0.01" min="0" value={p?.min_subtotal ?? ''} placeholder="—" class={input} />
        </label>
      </div>
    </div>

    <!-- Périmètre -->
    <div class="rounded-lg border border-border bg-card p-4">
      <h3 class="eyebrow mb-3">Périmètre</h3>
      <label class={label}>S'applique à
        <select name="scope" bind:value={scope} class={input}>
          <option value="all">Tout le catalogue</option>
          <option value="collection">Certaines collections</option>
          <option value="book">Certains livres</option>
        </select>
      </label>
      {#if scope === 'collection'}
        <div class="mt-3 max-h-48 space-y-1 overflow-auto rounded-md border border-border p-2">
          {#each data.collections as c (c.id)}
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="collections" value={String(c.id)} checked={collSet.has(String(c.id))} class="size-4 rounded border-border" /> {c.name}</label>
          {/each}
        </div>
      {:else if scope === 'book'}
        <div class="mt-3">
          {#key p?.id}<EntityPicker name="bookIds" searchUrl="/api/books/search" labelField="title" initial={data.promo?.books ?? []} placeholder="Rechercher un livre…" />{/key}
        </div>
      {/if}
    </div>

    <!-- Validité & limite -->
    <div class="rounded-lg border border-border bg-card p-4">
      <h3 class="eyebrow mb-3">Validité & limite</h3>
      <div class="grid gap-4 sm:grid-cols-3">
        <label class={label}>Début <input name="starts_at" type="date" value={startDate} class={input} /></label>
        <label class={label}>Fin <input name="ends_at" type="date" value={endDate} class={input} /></label>
        <label class={label}>Quantité max <input name="max_uses" type="number" min="1" step="1" value={p?.max_uses ?? ''} placeholder="illimité" class={input} /></label>
      </div>
    </div>

    <!-- Clients -->
    <div class="rounded-lg border border-border bg-card p-4">
      <h3 class="eyebrow mb-1">Réservé à certains clients</h3>
      <p class="mb-3 text-xs text-muted-foreground">Laissez vide pour que le code soit utilisable par tout le monde.</p>
      {#key p?.id}<EntityPicker name="userIds" searchUrl="/api/customers/search" initial={data.promo?.users ?? []} placeholder="Rechercher un client…" />{/key}
    </div>
  </div>

  <div class="fixed bottom-6 right-6 z-40">
    {#if saving}
      <Button type="submit" variant="brand" disabled class="shadow-2xl"><Spinner size={16} class="animate-spin" /> Enregistrement…</Button>
    {:else}
      <Button type="submit" variant="brand" class="shadow-2xl"><FloppyDisk size={16} /> Enregistrer</Button>
    {/if}
  </div>
</form>

{#if !data.isNew}
  <div class="mt-8 max-w-2xl border-t border-border pt-4">
    <Button type="button" variant="ghost" size="sm" class="text-destructive hover:bg-destructive/10" onclick={() => (showDelete = true)}>
      <Trash size={15} /> Supprimer ce code
    </Button>
  </div>
{/if}

{#if showDelete}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div class="w-full max-w-sm rounded-lg border border-border bg-background p-5 shadow-2xl">
      <h3 class="text-base font-semibold">Supprimer ce code ?</h3>
      <p class="mt-1 text-sm text-muted-foreground">« {p?.code} » sera définitivement supprimé.</p>
      <div class="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onclick={() => (showDelete = false)}>Annuler</Button>
        <form method="POST" action="?/delete" use:enhance>
          <Button type="submit" size="sm" class="bg-destructive text-destructive-foreground hover:bg-destructive/90"><Trash size={15} /> Supprimer</Button>
        </form>
      </div>
    </div>
  </div>
{/if}
