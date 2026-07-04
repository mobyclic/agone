<script lang="ts">
  import { Plus, X } from 'phosphor-svelte';

  interface Tier { up_to: number | null; rate: number | null }
  let { initial = [], name = 'tiers' }: { initial?: { up_to?: number; rate: number }[]; name?: string } = $props();

  let rows = $state<Tier[]>([]);
  $effect(() => {
    rows = initial.length ? initial.map((t) => ({ up_to: t.up_to ?? null, rate: t.rate })) : [{ up_to: null, rate: null }];
  });

  const add = () => (rows = [...rows, { up_to: null, rate: null }]);
  const remove = (i: number) => (rows = rows.filter((_, j) => j !== i));
  const serialized = $derived(
    JSON.stringify(rows.filter((r) => r.rate != null && r.rate !== ('' as any)).map((r) => ({ up_to: r.up_to || undefined, rate: Number(r.rate) })))
  );
</script>

<input type="hidden" {name} value={serialized} />
<div class="space-y-1.5">
  {#each rows as row, i (i)}
    <div class="flex items-center gap-2 text-sm">
      <span class="text-muted-foreground">{i === 0 ? "jusqu'à" : 'puis jusqu\'à'}</span>
      <input type="number" min="1" bind:value={row.up_to} placeholder="∞" class="h-8 w-24 rounded-md border border-border bg-background px-2 text-sm" />
      <span class="text-muted-foreground">ex. :</span>
      <input type="number" min="0" max="100" step="0.5" bind:value={row.rate} class="h-8 w-20 rounded-md border border-border bg-background px-2 text-sm" />
      <span class="text-muted-foreground">%</span>
      {#if rows.length > 1}
        <button type="button" onclick={() => remove(i)} class="grid size-7 place-items-center rounded text-muted-foreground hover:text-destructive" aria-label="Retirer"><X size={13} /></button>
      {/if}
    </div>
  {/each}
  <button type="button" onclick={add} class="inline-flex items-center gap-1 text-xs font-medium text-link hover:underline"><Plus size={12} /> Ajouter un palier</button>
  <p class="text-xs text-muted-foreground">Laissez le seuil vide sur le dernier palier (= au-delà, sans plafond).</p>
</div>
