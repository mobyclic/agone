<script lang="ts">
  import { enhance } from '$app/forms';
  import ImageUpload from '$lib/components/ImageUpload.svelte';
  import ContributorsEditor from '$lib/components/ContributorsEditor.svelte';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, FloppyDisk, Trash } from 'phosphor-svelte';

  let { data, form } = $props();
  const b = $derived(data.book);

  let coverId = $state<string | null>(null);
  let coverUrl = $state<string | null>(null);
  $effect(() => {
    coverId = data.book?.cover ? String(data.book.cover) : null;
    coverUrl = data.book?.cover_url ?? null;
  });

  const collSet = $derived(new Set((data.book?.collections ?? []).map(String)));
  const rubSet = $derived(new Set((data.book?.rubriques ?? []).map(String)));
  const pubDate = $derived(data.book?.published_at ? String(data.book.published_at).slice(0, 10) : '');
  const primaryColl = $derived(data.book?.primary_collection ? String(data.book.primary_collection) : '');

  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const label = 'mb-1 block text-sm font-medium';
</script>

<svelte:head><title>{data.isNew ? 'Nouveau livre' : b?.title} · Admin</title></svelte:head>

<a href="/admin/catalogue" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
  <ArrowLeft size={16} /> Catalogue
</a>

<form method="POST" action="?/save" use:enhance class="max-w-4xl">
  <div class="mb-4 flex items-center justify-between gap-3">
    <h2 class="text-xl font-bold">{data.isNew ? 'Nouveau livre' : b?.title}</h2>
    <Button type="submit"><FloppyDisk size={16} /> Enregistrer</Button>
  </div>

  {#if form?.error}<p class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}

  <div class="grid gap-6 lg:grid-cols-[1fr_280px]">
    <!-- Colonne principale -->
    <div class="space-y-5">
      <div class="rounded-lg border border-border bg-card p-4">
        <label class={label}>Titre *
          <input name="title" required value={b?.title ?? ''} class={input} />
        </label>
        <label class="{label} mt-3">Sous-titre
          <input name="subtitle" value={b?.subtitle ?? ''} class={input} />
        </label>
        <label class="{label} mt-3">Présentation (HTML)
          <textarea name="description_html" rows="8" class="{input} h-auto py-2 font-mono text-xs">{b?.description_html ?? ''}</textarea>
        </label>
        <label class="{label} mt-3">Informations complémentaires (HTML)
          <textarea name="extra_info_html" rows="3" class="{input} h-auto py-2 font-mono text-xs">{b?.extra_info_html ?? ''}</textarea>
        </label>
      </div>

      <div class="rounded-lg border border-border bg-card p-4">
        <h3 class="eyebrow mb-3">Contributeurs</h3>
        <ContributorsEditor initial={data.contributors} />
      </div>

      <div class="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
        <label class={label}>ISBN papier <input name="isbn_paper" value={b?.isbn_paper ?? ''} class={input} /></label>
        <label class={label}>ISBN ebook <input name="isbn_ebook" value={b?.isbn_ebook ?? ''} class={input} /></label>
        <label class={label}>Prix papier (€) <input name="price_paper" type="number" step="0.01" value={b?.price_paper ?? ''} class={input} /></label>
        <label class={label}>Prix ebook (€) <input name="price_ebook" type="number" step="0.01" value={b?.price_ebook ?? ''} class={input} /></label>
        <label class={label}>Prix souscription (€) <input name="subscription_price" type="number" step="0.01" value={b?.subscription_price ?? ''} class={input} /></label>
        <label class={label}>Parution <input name="published_at" type="date" value={pubDate} class={input} /></label>
        <label class={label}>Pages <input name="page_count" type="number" value={b?.page_count ?? ''} class={input} /></label>
        <label class={label}>Stock <input name="stock_qty" type="number" value={b?.stock_qty ?? 0} class={input} /></label>
        <label class={label}>Largeur (cm) <input name="width_cm" type="number" step="0.1" value={b?.width_cm ?? ''} class={input} /></label>
        <label class={label}>Hauteur (cm) <input name="height_cm" type="number" step="0.1" value={b?.height_cm ?? ''} class={input} /></label>
        <label class={label}>Titre original <input name="title_original" value={b?.title_original ?? ''} class={input} /></label>
        <label class={label}>Langue originale <input name="language_original" value={b?.language_original ?? ''} class={input} /></label>
      </div>
    </div>

    <!-- Colonne latérale -->
    <div class="space-y-5">
      <div class="rounded-lg border border-border bg-card p-4">
        <label class={label}>Statut
          <select name="status" class={input}>
            <option value="draft" selected={b?.status === 'draft'}>Brouillon</option>
            <option value="published" selected={b?.status === 'published' || data.isNew}>Publié</option>
            <option value="forthcoming" selected={b?.status === 'forthcoming'}>À paraître</option>
            <option value="out_of_print" selected={b?.status === 'out_of_print'}>Épuisé</option>
          </select>
        </label>
        <label class="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" name="featured" checked={b?.featured} class="size-4 rounded border-border" /> Mettre en avant (à la une)
        </label>
      </div>

      <div class="rounded-lg border border-border bg-card p-4">
        <h3 class="eyebrow mb-3">Couverture</h3>
        <ImageUpload bind:mediaId={coverId} bind:url={coverUrl} folder="livres/couvertures" kind="cover" label="" accept="image/*" />
        <input type="hidden" name="coverId" value={coverId ?? ''} />
      </div>

      <div class="rounded-lg border border-border bg-card p-4">
        <h3 class="eyebrow mb-2">Collection principale</h3>
        <select name="primary_collection" class="{input} mb-3">
          <option value="">—</option>
          {#each data.collections as c (c.id)}<option value={String(c.id)} selected={String(c.id) === primaryColl}>{c.name}</option>{/each}
        </select>
        <h3 class="eyebrow mb-2">Collections</h3>
        <div class="max-h-40 space-y-1 overflow-auto">
          {#each data.collections as c (c.id)}
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="collections" value={String(c.id)} checked={collSet.has(String(c.id))} class="size-4 rounded border-border" /> {c.name}</label>
          {/each}
        </div>
      </div>

      <div class="rounded-lg border border-border bg-card p-4">
        <h3 class="eyebrow mb-2">Rubriques</h3>
        <div class="max-h-40 space-y-1 overflow-auto">
          {#each data.rubriques as r (r.id)}
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="rubriques" value={String(r.id)} checked={rubSet.has(String(r.id))} class="size-4 rounded border-border" /> {r.name}</label>
          {/each}
        </div>
      </div>
    </div>
  </div>
</form>

{#if !data.isNew}
  <form method="POST" action="?/delete" use:enhance class="mt-6 max-w-4xl border-t border-border pt-4">
    <Button type="submit" variant="ghost" size="sm" class="text-destructive hover:bg-destructive/10"
      onclick={(e: Event) => { if (!confirm('Supprimer définitivement ce livre ?')) e.preventDefault(); }}>
      <Trash size={15} /> Supprimer ce livre
    </Button>
  </form>
{/if}
