<script lang="ts">
  /** Une réclame : bandeau (texte, lien, style) ou fenêtre (titre, texte, bouton, image), avec dates et état. */
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { Button } from '$lib/components/ui/button';
  import ImageUpload from '$lib/components/ImageUpload.svelte';
  import MediaPicker from '$lib/components/MediaPicker.svelte';
  import { ArrowLeft, FloppyDisk, X } from 'phosphor-svelte';
  let { data, form } = $props();
  $effect(() => { if (form?.error) toast.error(form.error); });
  const r = $derived(data.reclame);
  let kind = $state(untrack(() => data.kind));
  let imageId = $state<string | null>(untrack(() => data.reclame?.image_id ?? null));
  let imageUrl = $state<string | null>(untrack(() => data.reclame?.image_url ?? null));
  const label = 'mb-1 block text-sm font-medium';
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const jour = (s?: string) => (s ? String(s).slice(0, 10) : '');
</script>

<svelte:head><title>{r ? r.title : 'Nouvelle réclame'} · Admin Agone</title></svelte:head>

<a href="/admin/reclames" class="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> Réclames</a>

<form method="POST" action="?/save" use:enhance class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
  <div class="space-y-5">
    <div class="rounded-lg border border-border bg-card p-5">
      <div class="mb-4 flex overflow-hidden rounded-md border border-border text-sm">
        <button type="button" onclick={() => (kind = 'bandeau')} class="flex-1 px-3 py-2 {kind === 'bandeau' ? 'bg-foreground text-background' : 'hover:bg-muted'}">Bandeau au-dessus du menu</button>
        <button type="button" onclick={() => (kind = 'modal')} class="flex-1 px-3 py-2 {kind === 'modal' ? 'bg-foreground text-background' : 'hover:bg-muted'}">Fenêtre à l'arrivée</button>
      </div>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="imageId" value={imageId ?? ''} />

      <label class={label}>{kind === 'modal' ? 'Titre affiché' : 'Nom (interne)'} <input name="title" required value={r?.title ?? ''} class="{input} mt-1" /></label>
      {#if kind === 'bandeau'}
        <label class="{label} mt-4">Message<textarea name="message" rows="2" required class="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">{r?.message ?? ''}</textarea></label>
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <label class={label}>Lien (facultatif) <input name="url" value={r?.url ?? ''} placeholder="/livre/… ou https://…" class="{input} mt-1" /></label>
          <label class={label}>Style
            <select name="variant" value={r?.variant ?? 'info'} class="{input} mt-1">{#each Object.entries(data.variants) as [k, v] (k)}<option value={k}>{v}</option>{/each}</select>
          </label>
        </div>
      {:else}
        <label class="{label} mt-4">Texte<textarea name="message" rows="4" class="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">{r?.message ?? ''}</textarea></label>
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <label class={label}>Bouton <input name="cta_label" value={r?.cta_label ?? ''} placeholder="Découvrir" class="{input} mt-1" /></label>
          <label class={label}>Lien du bouton <input name="url" value={r?.url ?? ''} placeholder="/catalogue" class="{input} mt-1" /></label>
        </div>
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <label class={label}>Fréquence
            <select name="frequency" value={r?.frequency ?? 'day'} class="{input} mt-1">{#each Object.entries(data.frequences) as [k, v] (k)}<option value={k}>{v}</option>{/each}</select>
          </label>
          <label class={label}>Délai d'apparition (s) <input type="number" name="delay" min="0" max="60" value={r?.delay ?? 2} class="{input} mt-1" /></label>
        </div>
      {/if}
    </div>

    {#if kind === 'modal'}
      <div class="rounded-lg border border-border bg-card p-5">
        <h3 class="eyebrow mb-3">Image en tête de la fenêtre</h3>
        {#if imageUrl}
          <div class="relative mb-3 inline-block"><img src={imageUrl} alt="" class="max-h-56 rounded-md border border-border" />
            <button type="button" onclick={() => { imageId = null; imageUrl = null; }} class="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-destructive text-destructive-foreground shadow" aria-label="Retirer l'image"><X size={13} /></button></div>
        {/if}
        <div class="flex flex-wrap items-center gap-3">
          <ImageUpload bind:mediaId={imageId} bind:url={imageUrl} folder="media/reclames" label="Déposer une image" />
          <MediaPicker onselect={(m) => { imageId = m.id; imageUrl = m.url; }} />
        </div>
      </div>
    {/if}
  </div>

  <aside class="space-y-5">
    <div class="rounded-lg border border-border bg-card p-5">
      <h3 class="eyebrow mb-3">Publication</h3>
      <label class="flex items-center gap-2 text-sm"><input type="radio" name="status" value="draft" checked={(r?.status ?? 'draft') === 'draft'} class="accent-foreground" /> Brouillon</label>
      <label class="mt-2 flex items-center gap-2 text-sm"><input type="radio" name="status" value="published" checked={r?.status === 'published'} class="accent-foreground" /> En ligne (dans ses dates)</label>
      <div class="mt-4 grid gap-3">
        <label class={label}>Du <input type="date" name="starts_at" value={jour(r?.starts_at)} class="{input} mt-1" /></label>
        <label class={label}>Au <input type="date" name="ends_at" value={jour(r?.ends_at)} class="{input} mt-1" /></label>
      </div>
      <p class="mt-2 text-xs text-muted-foreground">Sans dates, la réclame reste en ligne tant qu'elle est publiée. Pour chaque type, la plus récente en ligne s'affiche.</p>
      <Button type="submit" variant="brand" class="mt-4 w-full"><FloppyDisk size={16} /> Enregistrer</Button>
    </div>
  </aside>
</form>
