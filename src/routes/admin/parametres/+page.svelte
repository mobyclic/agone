<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { FloppyDisk, Users, UsersThree, Receipt, BookOpen, Article, CalendarDots, DownloadSimple, Warning } from 'phosphor-svelte';

  let { data, form } = $props();
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const label = 'mb-1 block text-sm font-medium';

  const syncTypes = [
    { action: 'syncUsers', icon: Users, title: 'Utilisateurs', desc: 'Clients WordPress → comptes (par e-mail / legacy_wp_id).' },
    { action: 'syncOrders', icon: Receipt, title: 'Commandes', desc: 'Commandes WooCommerce + lignes (livres par legacy, clients rattachés).' },
    { action: 'syncBooks', icon: BookOpen, title: 'Livres', desc: 'Fiches livres (ISBN, prix, dates, stock) + contributions auteur/traducteur/préface.' },
    { action: 'syncAuthors', icon: UsersThree, title: 'Auteurs', desc: 'Auteurs (prénom / nom / slug).' },
    { action: 'syncArticles', icon: Article, title: 'Articles', desc: "Articles de L'Antichambre (corps, rubrique, auteurs, LettrInfo)." },
    { action: 'syncEvents', icon: CalendarDots, title: 'Rencontres', desc: 'Rencontres + lieux géolocalisés (dédupliqués), auteurs & livres liés.' }
  ];
</script>

<svelte:head><title>Paramètres · Admin Agone</title></svelte:head>

<div class="mb-6">
  <h2 class="text-xl font-bold">Paramètres</h2>
  <p class="text-sm text-muted-foreground">Coordonnées publiques et bandeau d'information du site.</p>
</div>

<div class="grid gap-6 lg:grid-cols-2">
  <!-- Coordonnées -->
  <form method="POST" action="?/contact" use:enhance class="rounded-lg border border-border bg-card p-5">
    <h3 class="mb-4 text-base font-semibold">Coordonnées</h3>
    <div class="space-y-4">
      <div>
        <label class={label} for="email">E-mail de contact</label>
        <input id="email" name="email" type="email" value={data.contact.email} class={input} />
      </div>
      <div>
        <label class={label} for="phone">Téléphone</label>
        <input id="phone" name="phone" value={data.contact.phone} class={input} />
      </div>
      <div>
        <label class={label} for="address">Adresse</label>
        <textarea id="address" name="address" rows="3" class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">{data.contact.address}</textarea>
      </div>
    </div>
    <div class="mt-4"><Button type="submit"><FloppyDisk size={16} /> Enregistrer</Button></div>
  </form>

  <!-- Bannière -->
  <form method="POST" action="?/banner" use:enhance class="rounded-lg border border-border bg-card p-5">
    <h3 class="mb-4 text-base font-semibold">Bandeau d'information</h3>
    <div class="space-y-4">
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" checked={data.banner.active} class="size-4 rounded border-border" />
        Afficher le bandeau en haut du site
      </label>
      <div>
        <label class={label} for="message">Message</label>
        <textarea id="message" name="message" rows="3" class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">{data.banner.message}</textarea>
      </div>
      <div>
        <label class={label} for="variant">Style</label>
        <select id="variant" name="variant" value={data.banner.variant} class={input}>
          <option value="info">Information</option>
          <option value="brand">Marque (rouge)</option>
          <option value="warning">Avertissement</option>
          <option value="success">Succès</option>
        </select>
      </div>
    </div>
    <div class="mt-4"><Button type="submit"><FloppyDisk size={16} /> Enregistrer</Button></div>
  </form>
</div>

<!-- Synchronisation pré-production -->
<div class="mt-10">
  <div class="mb-1 flex items-center gap-2">
    <DownloadSimple size={20} class="text-link" />
    <h3 class="text-base font-semibold">Synchronisation pré-production</h3>
  </div>
  <p class="mb-4 max-w-2xl text-sm text-muted-foreground">
    Récupère les derniers enregistrements de l'ancien site (WordPress/WooCommerce, lecture seule).
    Idempotent : ré-exécutable sans doublon (appariement par <span class="font-mono text-xs">legacy_wp_id</span>).
    Coche « Simulation » pour un aperçu sans écriture.
  </p>

  {#if form?.syncError}
    <p class="mb-4 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <Warning size={16} /> {form.syncError}
    </p>
  {/if}
  {#if form?.sync}
    <div class="mb-4 rounded-md border border-success/30 bg-success/10 px-3 py-2.5 text-sm">
      <p class="font-medium">
        {form.sync.dryRun ? 'Simulation' : 'Import'} — {form.sync.type} :
        {form.sync.created} créé(s), {form.sync.updated} mis à jour{#if form.sync.skipped}, {form.sync.skipped} ignoré(s){/if}
        <span class="text-muted-foreground">({form.sync.fetched} lus)</span>
      </p>
      {#if form.sync.warnings.length}
        <ul class="mt-1.5 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-muted-foreground">
          {#each form.sync.warnings as w (w)}<li>{w}</li>{/each}
        </ul>
      {/if}
    </div>
  {/if}

  {#if !data.wpReady}
    <p class="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
      <Warning size={16} /> Connexion WordPress non configurée (<span class="font-mono text-xs">WP_DB_HOST / WP_DB_USER / WP_DB_PASS / WP_DB_NAME</span> dans .env).
    </p>
  {:else}
    <div class="grid gap-4 sm:grid-cols-2">
      {#each syncTypes as t (t.action)}
        <form method="POST" action="?/{t.action}" use:enhance class="rounded-lg border border-border bg-card p-4">
          <div class="mb-2 flex items-center gap-2">
            <t.icon size={18} class="text-link" />
            <h4 class="font-semibold">{t.title}</h4>
          </div>
          <p class="mb-3 text-xs text-muted-foreground">{t.desc}</p>
          <div class="flex flex-wrap items-center gap-2">
            <label class="flex items-center gap-1.5 text-sm">
              Derniers
              <input name="limit" type="number" value="200" min="1" max="5000" class="h-9 w-20 rounded-md border border-border bg-background px-2 text-sm" />
            </label>
            <label class="flex items-center gap-1.5 text-sm text-muted-foreground">
              <input type="checkbox" name="dryRun" checked class="size-4 rounded border-border" /> Simulation
            </label>
            <Button type="submit" variant="outline" size="sm" class="ml-auto"><DownloadSimple size={15} /> Synchroniser</Button>
          </div>
        </form>
      {/each}
    </div>
    <p class="mt-3 text-xs text-muted-foreground">Ordre conseillé pour un import complet : Auteurs → Livres → Articles → Rencontres (les liens s'appuient sur les auteurs/livres déjà présents).</p>
  {/if}
</div>
