<script lang="ts">
  import { toast } from 'svelte-sonner';
  import { UploadSimple, X, Spinner } from 'phosphor-svelte';

  // Composant d'upload réutilisable. Poste sur /api/upload et remonte { id, url }.
  // Usage : <ImageUpload bind:mediaId bind:url folder="orgs/logos" />
  let {
    mediaId = $bindable<string | null>(null),
    url = $bindable<string | null>(null),
    folder = 'uploads',
    kind = 'image',
    label = 'Image',
    accept = 'image/*',
    class: klass = ''
  }: {
    mediaId?: string | null;
    url?: string | null;
    folder?: string;
    kind?: string;
    label?: string;
    accept?: string;
    class?: string;
  } = $props();

  let busy = $state(false);
  let input: HTMLInputElement;

  async function onPick(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    busy = true;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', folder);
      fd.append('kind', kind);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      mediaId = data.id;
      url = data.url;
    } catch (err) {
      toast.error('Échec de l\'upload');
      console.error(err);
    } finally {
      busy = false;
      if (input) input.value = '';
    }
  }

  function clear() {
    mediaId = null;
    url = null;
  }
</script>

<div class={klass}>
  <span class="mb-1.5 block text-sm font-medium">{label}</span>
  <div class="flex items-center gap-3">
    {#if url}
      <div class="relative">
        <img src={url} alt="" class="size-20 rounded-lg border border-border object-cover" />
        <button type="button" onclick={clear} class="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-destructive text-destructive-foreground shadow">
          <X size={13} />
        </button>
      </div>
    {/if}
    <button
      type="button"
      onclick={() => input.click()}
      disabled={busy}
      class="flex h-20 flex-1 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-link disabled:opacity-60"
    >
      {#if busy}<Spinner size={18} class="animate-spin" /> Envoi…{:else}<UploadSimple size={18} /> {url ? 'Remplacer' : 'Choisir un fichier'}{/if}
    </button>
  </div>
  <input bind:this={input} type="file" {accept} class="hidden" onchange={onPick} />
</div>
