<script lang="ts">
  import { enhance } from '$app/forms';
  import ImageUpload from '$lib/components/ImageUpload.svelte';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, FloppyDisk, Trash } from 'phosphor-svelte';

  let { data, form } = $props();
  const a = $derived(data.article);

  let coverId = $state<string | null>(null);
  let coverUrl = $state<string | null>(null);
  $effect(() => {
    coverId = data.article?.cover_id ?? null;
    coverUrl = data.article?.cover_url ?? null;
  });

  const pubDate = $derived(data.article?.published_at ? String(data.article.published_at).slice(0, 10) : '');

  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const label = 'mb-1 block text-sm font-medium';
</script>

<svelte:head><title>{data.isNew ? 'Nouvel article' : a?.title} · Admin</title></svelte:head>

<a href="/admin/contenu" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
  <ArrowLeft size={16} /> Contenu
</a>

<form method="POST" action="?/save" use:enhance class="max-w-3xl">
  <div class="mb-4 flex items-center justify-between gap-3">
    <h2 class="text-xl font-bold">{data.isNew ? 'Nouvel article' : a?.title}</h2>
    <Button type="submit"><FloppyDisk size={16} /> Enregistrer</Button>
  </div>

  {#if form?.error}<p class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}

  <div class="space-y-4 rounded-lg border border-border bg-card p-5">
    <div>
      <label class={label} for="title">Titre</label>
      <input id="title" name="title" value={a?.title ?? ''} required class={input} />
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <div>
        <label class={label} for="rubrique">Rubrique</label>
        <select id="rubrique" name="rubrique" value={a?.rubrique_id ?? ''} class={input}>
          <option value="">— Aucune —</option>
          {#each data.rubriques as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
        </select>
      </div>
      <div>
        <label class={label} for="slug">Slug (URL)</label>
        <input id="slug" name="slug" value={a?.slug ?? ''} placeholder="généré depuis le titre" class={input} />
      </div>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <div>
        <label class={label} for="status">Statut</label>
        <select id="status" name="status" value={a?.status ?? 'draft'} class={input}>
          <option value="draft">Brouillon</option>
          <option value="published">Publié</option>
        </select>
      </div>
      <div>
        <label class={label} for="published_at">Date de publication</label>
        <input id="published_at" name="published_at" type="date" value={pubDate} class={input} />
      </div>
    </div>

    <label class="flex items-center gap-2 text-sm">
      <input type="checkbox" name="is_newsletter_issue" checked={a?.is_newsletter_issue ?? false} class="size-4 rounded border-border" />
      Numéro de lettre d'information (LettrInfo)
    </label>

    <div>
      <label class={label} for="excerpt">Accroche</label>
      <textarea id="excerpt" name="excerpt" rows="2" class="{input} h-auto py-2">{a?.excerpt ?? ''}</textarea>
    </div>

    <div>
      <label class={label} for="body_html">Corps de l'article (HTML)</label>
      <textarea id="body_html" name="body_html" rows="16" class="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary">{a?.body_html ?? ''}</textarea>
    </div>

    <div>
      <span class={label}>Couverture</span>
      <ImageUpload bind:mediaId={coverId} bind:url={coverUrl} folder="blog/couvertures" kind="cover" label="" accept="image/*" />
      <input type="hidden" name="coverId" value={coverId ?? ''} />
    </div>
  </div>
</form>

{#if !data.isNew}
  <form method="POST" action="?/delete" use:enhance class="mt-4 max-w-3xl"
    onsubmit={(e) => { if (!confirm('Supprimer définitivement cet article ?')) e.preventDefault(); }}>
    <button type="submit" class="inline-flex items-center gap-1.5 text-sm text-destructive hover:underline">
      <Trash size={15} /> Supprimer l'article
    </button>
  </form>
{/if}
