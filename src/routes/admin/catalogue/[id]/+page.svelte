<script lang="ts">
  import { enhance } from '$app/forms';
  import { beforeNavigate } from '$app/navigation';
  import ImageUpload from '$lib/components/ImageUpload.svelte';
  import GalleryUpload from '$lib/components/GalleryUpload.svelte';
  import RichEditor from '$lib/components/RichEditor.svelte';
  import ContributorsEditor from '$lib/components/ContributorsEditor.svelte';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, FloppyDisk, Trash, Eye, Spinner, Lock, LockOpen, Warning, FileArrowUp, FileText, Info } from 'phosphor-svelte';
  import VentesExercices from '$lib/components/VentesExercices.svelte';

  let { data, form } = $props();
  const b = $derived(data.book);
  let dirty = $state(false);
  let saving = $state(false);

  // La fiche contient des liens sortants (contributeurs) : on prévient avant de
  // quitter avec des modifications non enregistrées.
  beforeNavigate((nav) => {
    if (!dirty || saving) return;
    if (!confirm('Des modifications ne sont pas enregistrées. Quitter cette page ?')) nav.cancel();
  });

  let coverId = $state<string | null>(null);
  let coverUrl = $state<string | null>(null);
  $effect(() => {
    coverId = data.book?.cover ? String(data.book.cover) : null;
    coverUrl = data.book?.cover_url ?? null;
  });

  // Un livre n'a qu'une collection : publiées d'abord, puis les autres (séparateur).
  const visibleCollections = $derived(data.collections.filter((c: any) => c.visible));
  const hiddenCollections = $derived(data.collections.filter((c: any) => !c.visible));
  const pubDate = $derived(data.book?.published_at ? String(data.book.published_at).slice(0, 10) : '');
  const subEndDate = $derived(data.book?.subscription_end ? String(data.book.subscription_end).slice(0, 10) : '');
  const primaryColl = $derived(data.book?.primary_collection ? String(data.book.primary_collection) : '');

  // Mots-clés : saisie libre + suggestions tirées du vocabulaire déjà employé.
  let motsCles = $state('');
  $effect(() => { motsCles = (data.book?.keywords ?? []).join(', '); });
  const motsSaisis = $derived(motsCles.split(/[,;]/).map((k) => k.trim().toLowerCase()).filter(Boolean));
  const suggestions = $derived((data.allKeywords ?? []).filter((k: string) => !motsSaisis.includes(k.toLowerCase())).slice(0, 30));
  function ajouterMot(k: string) {
    motsCles = motsCles.trim() ? `${motsCles.replace(/[,;\s]+$/, '')}, ${k}` : k;
    dirty = true;
  }

  // Slug : verrouillé par défaut. Le changer casse les liens déjà partagés (réseaux,
  // newsletters, moteurs de recherche) ; l'ancien slug redirige, mais mieux vaut
  // ne le faire que sur un livre récent.
  let slugVerrouille = $state(true);
  let slugAlerte = $state(false);
  let slug = $state('');
  $effect(() => { slug = data.book?.slug ?? ''; slugVerrouille = !data.isNew; slugAlerte = false; });
  const joursDepuisParution = $derived(
    data.book?.published_at ? Math.floor((Date.now() - new Date(data.book.published_at).getTime()) / 86400e3) : null
  );
  const livreAncien = $derived(joursDepuisParution != null && joursDepuisParution > 60);

  // Fichiers ebook : formulaire distinct (envoi de fichier), donc hors du
  // formulaire principal — les formulaires ne s'imbriquent pas.
  let envoiEbook = $state(false);
  const poids = (o?: number) => (o == null ? '' : o > 1048576 ? `${(o / 1048576).toFixed(1)} Mo` : `${Math.round(o / 1024)} Ko`);

  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const label = 'mb-1 block text-sm font-medium';
</script>

<svelte:head><title>{data.isNew ? 'Nouveau livre' : b?.title} · Admin</title></svelte:head>

<a href="/admin/catalogue" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
  <ArrowLeft size={16} /> Catalogue
</a>

<form method="POST" action="?/save" use:enhance={() => { saving = true; return async ({ update }) => { await update({ reset: false }); dirty = false; saving = false; }; }} oninput={() => (dirty = true)} onchange={() => (dirty = true)} class="pb-10">
  <h2 class="mb-4 text-xl font-bold">{data.isNew ? 'Nouveau livre' : b?.title}</h2>

  {#if form?.error}<p class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}

  <!-- Pleine largeur : les textes à gauche, tout le reste (après « Informations
       complémentaires ») dans la colonne de droite. -->
  <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start 2xl:grid-cols-[minmax(0,1fr)_28rem]">
    <!-- Colonne principale -->
    <div class="min-w-0 space-y-5">
      <div class="rounded-lg border border-border bg-card p-4">
        <label class={label}>Titre *
          <input name="title" required value={b?.title ?? ''} class="{input} h-12 font-display text-xl font-semibold" />
        </label>
        <label class="{label} mt-3">Sous-titre
          <input name="subtitle" value={b?.subtitle ?? ''} class={input} />
        </label>
        <span class="{label} mt-3">Présentation</span>
        {#key b?.id}<RichEditor name="description_html" value={b?.description_html ?? ''} minHeight="20rem" onchange={() => (dirty = true)} />{/key}
        <span class="{label} mt-3 block">Informations complémentaires</span>
        {#key b?.id}<RichEditor name="extra_info_html" value={b?.extra_info_html ?? ''} minHeight="8rem" onchange={() => (dirty = true)} />{/key}
      </div>
    </div>

    <!-- Colonne latérale -->
    <div class="space-y-5">
      <div class="rounded-lg border border-border bg-card p-4">
        <label class={label}>Statut
          <select name="status" class={input}>
            <option value="draft" selected={b?.status === 'draft'}>Brouillon</option>
            <option value="published" selected={b?.status === 'published' || b?.status === 'out_of_print' || data.isNew}>En ligne</option>
            <option value="archived" selected={b?.status === 'archived'}>Archivé</option>
          </select>
        </label>
        <p class="mt-2 text-xs text-muted-foreground">« À paraître » et « Épuisé » sont automatiques : un livre en ligne est à paraître tant que sa date de parution est à venir, épuisé quand son stock tombe à zéro. Archivé = retiré du site sans être supprimé.</p>
        <label class="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" name="featured" checked={b?.featured} class="size-4 rounded border-border" /> Mettre en avant (à la une)
        </label>

        <!-- Slug (adresse du livre), verrouillé -->
        <div class="mt-4 border-t border-border pt-3">
          <label class={label} for="slug">Adresse (slug)</label>
          <div class="flex items-stretch">
            <span class="flex items-center border border-r-0 border-border bg-muted px-2 text-xs text-muted-foreground">/livre/</span>
            <input id="slug" name="slug" bind:value={slug} readonly={slugVerrouille} placeholder="généré depuis le titre"
              class="h-10 min-w-0 flex-1 border border-border px-2 font-mono text-xs outline-none focus:border-primary {slugVerrouille ? 'bg-muted/50 text-muted-foreground' : 'bg-background'}" />
            {#if !data.isNew}
              <button type="button" onclick={() => (slugVerrouille ? (slugAlerte = !slugAlerte) : ((slugVerrouille = true), (slug = b?.slug ?? '')))}
                title={slugVerrouille ? 'Déverrouiller pour modifier' : 'Reverrouiller (annule la modification)'}
                class="grid w-10 shrink-0 place-items-center border border-l-0 border-border {slugVerrouille ? 'text-muted-foreground hover:text-foreground' : 'bg-warning/10 text-warning'}">
                {#if slugVerrouille}<Lock size={16} weight="bold" />{:else}<LockOpen size={16} weight="bold" />{/if}
              </button>
            {/if}
          </div>
          {#if slugAlerte && slugVerrouille}
            <div class="mt-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs leading-relaxed">
              <p class="flex items-center gap-1.5 font-semibold text-warning"><Warning size={14} weight="bold" /> Modifier l'adresse d'un livre est toujours délicat</p>
              <p class="mt-1">
                Les liens déjà diffusés (réseaux sociaux, newsletters, librairies, moteurs de recherche) pointent sur l'adresse actuelle.
                L'ancienne adresse redirigera vers la nouvelle, mais mieux vaut ne le faire que pour un livre <strong>récent</strong>.
                {#if livreAncien}<br /><strong>Ce livre est paru il y a {joursDepuisParution} jours.</strong>{/if}
              </p>
              <div class="mt-2 flex gap-2">
                <button type="button" onclick={() => { slugVerrouille = false; slugAlerte = false; }} class="rounded border border-warning bg-warning px-2.5 py-1 font-medium text-white hover:opacity-90">Modifier quand même</button>
                <button type="button" onclick={() => (slugAlerte = false)} class="rounded border border-border bg-background px-2.5 py-1 hover:bg-muted">Annuler</button>
              </div>
            </div>
          {/if}
        </div>
      </div>

      <div class="rounded-lg border border-border bg-card p-4">
        <h3 class="eyebrow mb-3">Contributeurs</h3>
        <ContributorsEditor initial={data.contributors} />
      </div>

      <div class="rounded-lg border border-border bg-card p-4">
        <h3 class="eyebrow mb-3">Couverture</h3>
        <ImageUpload bind:mediaId={coverId} bind:url={coverUrl} folder="livres/couvertures" kind="cover" label="" accept="image/*" />
        <input type="hidden" name="coverId" value={coverId ?? ''} />
      </div>

      <div class="rounded-lg border border-border bg-card p-4">
        <label class={label} for="keywords">Mots-clés</label>
        <input id="keywords" name="keywords" bind:value={motsCles} placeholder="histoire sociale, syndicalisme, …" class={input} />
        <p class="mt-1.5 text-xs text-muted-foreground">Séparés par des virgules. Ils alimentent le filtre « Mots-clés » du catalogue.</p>
        {#if suggestions.length}
          <!-- Mots-clés déjà utilisés ailleurs : un clic les ajoute (vocabulaire commun). -->
          <div class="mt-2 flex flex-wrap gap-1">
            {#each suggestions as k (k)}
              <button type="button" onclick={() => ajouterMot(k)} class="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-foreground hover:text-foreground">+ {k}</button>
            {/each}
          </div>
        {/if}
      </div>

      <div class="rounded-lg border border-border bg-card p-4">
        <h3 class="eyebrow mb-2">Collection</h3>
        <select name="primary_collection" class={input}>
          <option value="">—</option>
          <optgroup label="Publiées">
            {#each visibleCollections as c (c.id)}<option value={String(c.id)} selected={String(c.id) === primaryColl}>{c.name}</option>{/each}
          </optgroup>
          {#if hiddenCollections.length}
            <optgroup label="Sans titre publié">
              {#each hiddenCollections as c (c.id)}<option value={String(c.id)} selected={String(c.id) === primaryColl}>{c.name}</option>{/each}
            </optgroup>
          {/if}
        </select>
      </div>

      <div class="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4">
        <h3 class="eyebrow col-span-2">Fiche technique</h3>
        <label class="{label} col-span-2 sm:col-span-1">ISBN papier <input name="isbn_paper" value={b?.isbn_paper ?? ''} class={input} /></label>
        <label class="{label} col-span-2 sm:col-span-1">ISBN ebook <input name="isbn_ebook" value={b?.isbn_ebook ?? ''} class={input} /></label>
        <label class={label}>Prix papier (€) <input name="price_paper" type="number" step="0.01" value={b?.price_paper ?? ''} class={input} /></label>
        <label class={label}>Prix ebook (€) <input name="price_ebook" type="number" step="0.01" value={b?.price_ebook ?? ''} class={input} /></label>
        <label class={label}>Prix souscription (€) <input name="subscription_price" type="number" step="0.01" value={b?.subscription_price ?? ''} class={input} /></label>
        <label class={label}>Souscription jusqu'au <input name="subscription_end" type="date" value={subEndDate} class={input} /></label>
        <label class={label}>Parution <input name="published_at" type="date" value={pubDate} class={input} /></label>
        <label class={label}>Pages <input name="page_count" type="number" value={b?.page_count ?? ''} class={input} /></label>
        <label class={label}>Stock <input name="stock_qty" type="number" value={b?.stock_qty ?? 0} class={input} /></label>
        <label class={label}>Poids (g) <input name="weight_grams" type="number" step="1" min="0" value={b?.weight_grams ?? ''} placeholder="frais de port" class={input} /></label>
        <label class={label}>Largeur (cm) <input name="width_cm" type="number" step="0.1" value={b?.width_cm ?? ''} class={input} /></label>
        <label class={label}>Hauteur (cm) <input name="height_cm" type="number" step="0.1" value={b?.height_cm ?? ''} class={input} /></label>
        <label class={label}>Titre original <input name="title_original" value={b?.title_original ?? ''} class={input} /></label>
        <label class={label}>Langue originale <input name="language_original" value={b?.language_original ?? ''} class={input} /></label>
      </div>

      <div class="rounded-lg border border-border bg-card p-4">
        <h3 class="eyebrow mb-3">Autres images (4e de couverture, photos…)</h3>
        {#key b?.id}<GalleryUpload name="galleryIds" initial={b?.gallery ?? []} folder="livres/galerie" label="" />{/key}
      </div>
    </div>
  </div>

  <!-- Bouton flottant : Voir ↔ Enregistrer -->
  <div class="fixed bottom-6 right-6 z-40">
    {#if saving}
      <Button type="submit" variant="brand" disabled class="shadow-2xl"><Spinner size={16} class="animate-spin" /> Enregistrement…</Button>
    {:else if data.isNew || dirty}
      <Button type="submit" variant="brand" class="shadow-2xl"><FloppyDisk size={16} /> Enregistrer</Button>
    {:else if b?.slug}
      <Button href="/livre/{b.slug}" variant="outline" class="bg-background shadow-2xl"><Eye size={16} /> Voir en ligne</Button>
    {/if}
  </div>
</form>

{#if !data.isNew}
  <!-- Fichiers ebook : déposés sur le stockage privé, servis seulement aux acheteurs
       (cf. /api/ebook/[id]/download) et à l'équipe. -->
  <section class="mb-8 rounded-lg border border-border bg-card p-4 lg:max-w-3xl">
    <h3 class="eyebrow mb-1">Fichier ebook</h3>
    <p class="mb-3 text-xs text-muted-foreground">
      ePub ou PDF, 60 Mo maximum. Le fichier n'est jamais public : il n'est téléchargeable que depuis la
      bibliothèque des clients qui l'ont acheté. Sans fichier déposé, le format numérique n'est pas mis en vente.
    </p>

    {#if (form as any)?.ebookError}
      <p class="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{(form as any).ebookError}</p>
    {/if}

    {#if data.ebooks.length}
      <ul class="mb-3 divide-y divide-border rounded-md border border-border">
        {#each data.ebooks as f (f.id)}
          <li class="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
            <FileText size={18} class="shrink-0 text-muted-foreground" />
            <span class="min-w-0 flex-1 truncate font-medium">{f.filename ?? f.id}</span>
            <span class="shrink-0 text-xs uppercase text-muted-foreground">{f.format}{f.size ? ` · ${poids(f.size)}` : ''}</span>
            <span class="shrink-0 rounded px-2 py-0.5 text-xs {f.status === 'available' ? 'bg-success/15 text-success' : 'bg-secondary text-muted-foreground'}">{f.status === 'available' ? 'Disponible' : f.status}</span>
            <form method="POST" action="?/ebookSupprimer" use:enhance class="shrink-0"
              onsubmit={(e) => { if (!confirm('Retirer ce fichier ? Les clients qui l’ont acheté n’y auront plus accès.')) e.preventDefault(); }}>
              <input type="hidden" name="assetId" value={f.id} />
              <button type="submit" class="grid size-8 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-destructive" aria-label="Retirer le fichier"><Trash size={15} /></button>
            </form>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="mb-3 flex items-center gap-1.5 rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        <Info size={15} /> Aucun fichier déposé{b?.price_ebook ? ' — le prix numérique est renseigné, mais le livre n’est pas vendable en ePub.' : '.'}
      </p>
    {/if}

    <form method="POST" action="?/ebook" enctype="multipart/form-data"
      use:enhance={() => { envoiEbook = true; return async ({ update }) => { await update({ reset: true }); envoiEbook = false; }; }}
      class="flex flex-wrap items-center gap-3">
      <input type="file" name="file" accept=".epub,.pdf,application/epub+zip,application/pdf" required
        class="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted" />
      <Button type="submit" variant="outline" disabled={envoiEbook}>
        {#if envoiEbook}<Spinner size={16} class="animate-spin" /> Dépôt…{:else}<FileArrowUp size={16} /> Déposer{/if}
      </Button>
    </form>
  </section>

  <!-- Ce que ce titre a vendu, année par année (administrateurs). -->
  {#if data.ventes.length}
    <section class="mb-8">
      <VentesExercices exercices={data.ventes} />
      <a href="/admin/droits/contrats/{String(b?.id ?? '').replace('book:', '')}" class="mt-2 inline-block text-sm text-link hover:underline">
        Contrats, provision et mouvements de stock de ce titre →
      </a>
    </section>
  {/if}

  <form method="POST" action="?/delete" use:enhance class="border-t border-border pt-4 pb-24">
    <Button type="submit" variant="ghost" size="sm" class="text-destructive hover:bg-destructive/10"
      onclick={(e: Event) => { if (!confirm('Supprimer définitivement ce livre ?')) e.preventDefault(); }}>
      <Trash size={15} /> Supprimer ce livre
    </Button>
  </form>
{/if}
