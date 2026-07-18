<script lang="ts">
  import { untrack } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { UploadSimple, X, Spinner } from 'phosphor-svelte';

  // Upload multiple → input caché `name` avec un tableau JSON d'ids de média.
  let {
    name,
    initial = [],
    folder = 'uploads',
    kind = 'image',
    label = 'Images'
  }: { name: string; initial?: { id: string; url: string }[]; folder?: string; kind?: string; label?: string } = $props();

  let items = $state<{ id: string; url: string }[]>(untrack(() => [...initial]));
  let busy = $state(false);
  let input: HTMLInputElement;

  async function onPick(e: Event) {
    const files = Array.from((e.currentTarget as HTMLInputElement).files ?? []);
    if (!files.length) return;
    busy = true;
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('folder', folder);
        fd.append('kind', kind);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        items = [...items, { id: data.id, url: data.url }];
      }
    } catch (err) {
      toast.error("Échec de l'upload");
      console.error(err);
    } finally {
      busy = false;
      if (input) input.value = '';
    }
  }
  const remove = (i: number) => (items = items.filter((_, j) => j !== i));
  const idsJson = $derived(JSON.stringify(items.map((x) => x.id)));
</script>

<div>
  <span class="mb-1.5 block text-sm font-medium">{label}</span>
  <div class="flex flex-wrap gap-2">
    {#each items as it, i (it.id)}
      <div class="relative">
        <img src={it.url} alt="" class="size-20 rounded-lg border border-border object-cover" />
        <button type="button" onclick={() => remove(i)} class="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-destructive text-destructive-foreground shadow"><X size={13} /></button>
      </div>
    {/each}
    <button type="button" onclick={() => input.click()} disabled={busy}
      class="grid size-20 place-items-center rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary hover:text-link disabled:opacity-60">
      {#if busy}<Spinner size={18} class="animate-spin" />{:else}<UploadSimple size={18} />{/if}
    </button>
  </div>
  <input bind:this={input} type="file" accept="image/*" multiple class="hidden" onchange={onPick} />
  <input type="hidden" {name} value={idsJson} />
</div>
