<script lang="ts">
  import { enhance } from '$app/forms';
  import ImageUpload from '$lib/components/ImageUpload.svelte';
  import RichEditor from '$lib/components/RichEditor.svelte';
  import EntityPicker from '$lib/components/EntityPicker.svelte';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, FloppyDisk, Trash, Eye, Spinner, CalendarBlank, MapPin, Clock } from 'phosphor-svelte';
  import { dateVersHeureParis, heureParisVersDate } from '$lib/dates';

  let { data, form } = $props();
  const a = $derived(data.article);
  let dirty = $state(false);
  let saving = $state(false);

  let coverId = $state<string | null>(null);
  let coverUrl = $state<string | null>(null);
  $effect(() => {
    coverId = data.article?.cover_id ?? null;
    coverUrl = data.article?.cover_url ?? null;
  });

  // Publication : statut + date/heure (heure de Paris). Publié + date future = programmé.
  let statut = $state('draft');
  let datePub = $state('');
  $effect(() => {
    statut = data.article?.status ?? 'draft';
    datePub = dateVersHeureParis(data.article?.published_at);
  });
  const programme = $derived(statut === 'published' && !!datePub && (heureParisVersDate(datePub)?.getTime() ?? 0) > Date.now());
  let toutesRencontres = $state(false);
  const fmtRencontre = (s?: string) =>
    s ? new Date(s).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' }) : '';

  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const label = 'mb-1 block text-sm font-medium';
  const carte = 'rounded-lg border border-border bg-card p-4';
</script>

<svelte:head><title>{data.isNew ? 'Nouvel article' : a?.title} · Admin</title></svelte:head>

<a href="/admin/articles" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
  <ArrowLeft size={16} /> Contenu
</a>

<form method="POST" action="?/save" use:enhance={() => { saving = true; return async ({ update }) => { await update({ reset: false }); dirty = false; saving = false; }; }} oninput={() => (dirty = true)} onchange={() => (dirty = true)}>
  {#if form?.error}<p class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}

  <!-- Deux colonnes : le texte à gauche (titre + corps), tout le reste à droite. -->
  <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_24rem]">
    <div class="min-w-0 space-y-4">
      <div>
        <label class="sr-only" for="title">Titre</label>
        <textarea id="title" name="title" required rows="1" placeholder="Titre de l'article"
          class="field-sizing-content w-full resize-none rounded-md border border-border bg-card px-3 py-2 font-display text-2xl font-bold leading-tight outline-none focus:border-primary sm:text-3xl"
          onkeydown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}>{a?.title ?? ''}</textarea>
      </div>

      <div>
        <span class="sr-only">Corps de l'article</span>
        {#key a?.id}<RichEditor name="body_html" value={a?.body_html ?? ''} minHeight="32rem" onchange={() => (dirty = true)} />{/key}
      </div>
    </div>

    <aside class="space-y-4">
      {#if data.rencontres.length}
        <!-- En tête : rencontres à venir d'un auteur ou d'un livre de l'article. -->
        <div class="rounded-lg border border-link/40 bg-link/5 p-4">
          <p class="mb-2 flex items-center gap-1.5 font-display text-sm font-semibold uppercase tracking-wide text-link">
            <CalendarBlank size={16} weight="bold" /> Rencontre{data.rencontres.length > 1 ? 's' : ''} à venir
          </p>
          <ul class="space-y-2.5">
            {#each toutesRencontres ? data.rencontres : data.rencontres.slice(0, 3) as r (r.id)}
              <li class="text-sm">
                <a href="/admin/rencontres/{r.id}" class="font-medium leading-snug hover:text-link">{r.title}</a>
                <div class="mt-0.5 text-xs text-muted-foreground">
                  <span class="first-letter:uppercase">{fmtRencontre(r.start_at)}</span>{#if r.venue} · <MapPin size={11} class="mb-0.5 inline" /> {r.venue}{/if}
                </div>
                {#if r.via.length}<div class="text-xs text-muted-foreground">via {r.via.join(', ')}</div>{/if}
              </li>
            {/each}
          </ul>
          {#if data.rencontres.length > 3}
            <button type="button" onclick={() => (toutesRencontres = !toutesRencontres)} class="mt-2 text-xs font-medium text-link hover:underline">
              {toutesRencontres ? 'Réduire' : `+ ${data.rencontres.length - 3} autre${data.rencontres.length - 3 > 1 ? 's' : ''}`}
            </button>
          {/if}
        </div>
      {/if}

      <div class="{carte} space-y-3">
        <div>
          <label class={label} for="status">Statut</label>
          <select id="status" name="status" bind:value={statut} class={input}>
            <option value="draft">Brouillon</option>
            <option value="published">Publié</option>
          </select>
        </div>
        <div>
          <label class={label} for="published_at">Date de publication</label>
          <input id="published_at" name="published_at" type="datetime-local" bind:value={datePub} class={input} />
          {#if programme}
            <p class="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-warning"><Clock size={13} weight="bold" /> Programmé : visible sur le site à partir de cette date.</p>
          {:else if statut === 'published' && !datePub}
            <p class="mt-1.5 text-xs text-muted-foreground">Sans date, l'article est daté du moment de l'enregistrement.</p>
          {/if}
        </div>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_newsletter_issue" checked={a?.is_newsletter_issue ?? false} class="size-4 rounded border-border" />
          Numéro de lettre d'information (LettrInfo)
        </label>
      </div>

      <div class="{carte} space-y-3">
        <div>
          <label class={label} for="rubrique">Rubrique</label>
          <select id="rubrique" name="rubrique" value={a?.rubrique_id ?? ''} class={input}>
            <option value="">— Aucune —</option>
            <optgroup label="Publiées">
              {#each data.rubriques.filter((r) => r.visible) as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
            </optgroup>
            {#if data.rubriques.some((r) => !r.visible)}
              <optgroup label="Sans article publié">
                {#each data.rubriques.filter((r) => !r.visible) as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
              </optgroup>
            {/if}
          </select>
        </div>
        <div>
          <label class={label} for="slug">Slug (URL)</label>
          <input id="slug" name="slug" value={a?.slug ?? ''} placeholder="généré depuis le titre" class={input} />
        </div>
      </div>

      <div class={carte}>
        <span class={label}>Auteur(s)</span>
        {#key a?.id}<EntityPicker name="authorIds" searchUrl="/api/authors/search" labelField="full_name" visuel="avatar" initial={a?.authors ?? []} placeholder="Ajouter un auteur…" onchange={() => (dirty = true)} />{/key}
      </div>

      <div class={carte}>
        <span class={label}>Livres associés</span>
        {#key a?.id}<EntityPicker name="bookIds" searchUrl="/api/books/search" labelField="title" visuel="couverture" lienBase="/admin/catalogue/" initial={a?.books ?? []} placeholder="Associer un livre…" onchange={() => (dirty = true)} />{/key}
      </div>

      <div class={carte}>
        <span class={label}>Couverture</span>
        <ImageUpload bind:mediaId={coverId} bind:url={coverUrl} folder="blog/couvertures" kind="cover" label="" accept="image/*" />
        <input type="hidden" name="coverId" value={coverId ?? ''} />
      </div>
    </aside>
  </div>

  <!-- Bouton flottant : Voir ↔ Enregistrer selon l'état de modification -->
  <div class="fixed bottom-6 right-6 z-40">
    {#if saving}
      <Button type="submit" variant="brand" disabled class="shadow-2xl"><Spinner size={16} class="animate-spin" /> Enregistrement…</Button>
    {:else if data.isNew || dirty}
      <Button type="submit" variant="brand" class="shadow-2xl"><FloppyDisk size={16} /> Enregistrer</Button>
    {:else if a?.slug}
      <!-- Même fenêtre : on revient à l'édition par le bouton « Éditer » de l'article. -->
      <Button href="/article/{a.slug}" variant="outline" class="bg-background shadow-2xl"><Eye size={16} /> Voir en ligne</Button>
    {/if}
  </div>
</form>

{#if !data.isNew}
  <form method="POST" action="?/delete" use:enhance class="mt-6 pb-24"
    onsubmit={(e) => { if (!confirm('Supprimer définitivement cet article ?')) e.preventDefault(); }}>
    <button type="submit" class="inline-flex items-center gap-1.5 text-sm text-destructive hover:underline">
      <Trash size={15} /> Supprimer l'article
    </button>
  </form>
{/if}
