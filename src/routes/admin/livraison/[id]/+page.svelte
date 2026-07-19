<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { COUNTRIES } from '$lib/countries';
  import { ArrowLeft, FloppyDisk, Trash, Plus, Spinner } from 'phosphor-svelte';

  let { data, form } = $props();
  const z = $derived(data.zone);

  let restOfWorld = $state(untrack(() => data.zone?.rest_of_world ?? false));
  const countrySet = $derived(new Set(data.zone?.countries ?? []));

  type Tier = { up_to: number | null; price: number };
  let rates = $state<Tier[]>(untrack(() =>
    data.zone?.rates?.length ? data.zone.rates.map((r: any) => ({ up_to: r.up_to ?? null, price: r.price ?? 0 })) : [{ up_to: 500, price: 5 }]
  ));
  const addTier = () => (rates = [...rates, { up_to: null, price: 0 }]);
  const removeTier = (i: number) => (rates = rates.filter((_, j) => j !== i));
  const ratesJson = $derived(JSON.stringify(rates.map((r) => ({ up_to: r.up_to == null || (r.up_to as any) === '' ? null : Number(r.up_to), price: Number(r.price) || 0 }))));

  let showDelete = $state(false);
  let saving = $state(false);
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const label = 'mb-1 block text-sm font-medium';
</script>

<svelte:head><title>{data.isNew ? 'Nouvelle zone' : z?.name} · Admin</title></svelte:head>

<a href="/admin/livraison" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Livraison</a>

<form method="POST" action="?/save" use:enhance={() => { saving = true; return async ({ update }) => { await update(); saving = false; }; }} class="max-w-2xl pb-24">
  <h2 class="mb-4 text-xl font-bold">{data.isNew ? 'Nouvelle zone de livraison' : z?.name}</h2>
  {#if form?.error}<p class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}

  <div class="space-y-5">
    <div class="rounded-lg border border-border bg-card p-4">
      <label class={label}>Nom de la zone * <input name="name" required value={z?.name ?? ''} placeholder="France, Union européenne, Monde…" class={input} /></label>
      <label class="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" checked={data.isNew ? true : z?.active} class="size-4 rounded border-border" /> Active
      </label>
    </div>

    <!-- Pays -->
    <div class="rounded-lg border border-border bg-card p-4">
      <h3 class="eyebrow mb-3">Pays desservis</h3>
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" name="rest_of_world" bind:checked={restOfWorld} class="size-4 rounded border-border" />
        Reste du monde (tous les pays non couverts par une autre zone)
      </label>
      {#if !restOfWorld}
        <p class="mt-3 mb-2 text-xs text-muted-foreground">Cochez les pays couverts par cette zone. Un pays absent de toute zone n'est pas livrable.</p>
        <div class="grid max-h-64 grid-cols-2 gap-x-4 gap-y-1 overflow-auto rounded-md border border-border p-2 sm:grid-cols-3">
          {#each COUNTRIES as c (c.code)}
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="countries" value={c.code} checked={countrySet.has(c.code)} class="size-4 rounded border-border" /> {c.name}</label>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Tarifs au poids -->
    <div class="rounded-lg border border-border bg-card p-4">
      <h3 class="eyebrow mb-1">Tarifs au poids</h3>
      <p class="mb-3 text-xs text-muted-foreground">Chaque palier s'applique jusqu'au poids indiqué. Laissez « Jusqu'à » vide pour le dernier palier (au-delà).</p>
      <div class="space-y-2">
        {#each rates as r, i (i)}
          <div class="flex items-center gap-2">
            <div class="flex items-center gap-1.5">
              <span class="text-xs text-muted-foreground">Jusqu'à</span>
              <input type="number" min="0" step="1" bind:value={r.up_to} placeholder="au-delà" class="h-9 w-24 rounded-md border border-border bg-background px-2 text-sm" />
              <span class="text-xs text-muted-foreground">g</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="text-xs text-muted-foreground">→</span>
              <input type="number" min="0" step="0.01" bind:value={r.price} class="h-9 w-24 rounded-md border border-border bg-background px-2 text-right text-sm" />
              <span class="text-xs text-muted-foreground">€</span>
            </div>
            <button type="button" onclick={() => removeTier(i)} class="ml-auto grid size-8 place-items-center text-muted-foreground hover:text-destructive" aria-label="Retirer le palier"><Trash size={15} /></button>
          </div>
        {/each}
      </div>
      <button type="button" onclick={addTier} class="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground hover:border-primary hover:text-foreground"><Plus size={14} /> Ajouter un palier</button>
      <input type="hidden" name="rates" value={ratesJson} />

      <label class="{label} mt-4">Franco de port au-dessus de (€)
        <input name="free_over" type="number" step="0.01" min="0" value={z?.free_over ?? ''} placeholder="jamais offert" class="{input} max-w-[12rem]" />
      </label>
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
      <Trash size={15} /> Supprimer cette zone
    </Button>
  </div>
{/if}

{#if showDelete}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div class="w-full max-w-sm rounded-lg border border-border bg-background p-5 shadow-2xl">
      <h3 class="text-base font-semibold">Supprimer cette zone ?</h3>
      <p class="mt-1 text-sm text-muted-foreground">« {z?.name} » sera définitivement supprimée.</p>
      <div class="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onclick={() => (showDelete = false)}>Annuler</Button>
        <form method="POST" action="?/delete" use:enhance>
          <Button type="submit" size="sm" class="bg-destructive text-destructive-foreground hover:bg-destructive/90"><Trash size={15} /> Supprimer</Button>
        </form>
      </div>
    </div>
  </div>
{/if}
