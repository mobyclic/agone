<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { FloppyDisk, Users, UsersThree, Receipt, BookOpen, Article, CalendarDots, DownloadSimple, Warning, Spinner } from 'phosphor-svelte';

  let { data, form } = $props();
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const label = 'mb-1 block text-sm font-medium';

  /**
   * Import en cours, par type. Un import parcourt jusqu'à 500 enregistrements
   * contre la base WordPress distante : sans témoin, rien ne distingue « lancé »
   * de « pas cliqué », et on relance à l'aveugle.
   */
  let enCours = $state<Record<string, boolean>>({});

  const dateHeure = (iso?: string) =>
    iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

  /** Résumé du dernier import pour un type donné. */
  function syncInfo(key: string) {
    const st = (data.syncState ?? {})[key];
    if (!st?.at) return { label: 'Jamais synchronisé — le premier import reprendra tout.', tone: 'text-muted-foreground' };
    if (st.full_scan) return { label: `Dernier import ${dateHeure(st.at)} · balayage complet (WordPress ne date pas les modifications de comptes)`, tone: 'text-muted-foreground' };
    const q = st.watermark ? ` · à jour jusqu'au ${dateHeure(st.watermark)}` : '';
    return { label: `Dernier import ${dateHeure(st.at)} : ${st.created} créé(s), ${st.updated} mis à jour${q}`, tone: 'text-muted-foreground' };
  }

  const syncTypes = [
    { action: 'syncUsers', key: 'users', icon: Users, title: 'Utilisateurs', desc: 'Clients WordPress → comptes (par e-mail / legacy_wp_id).' },
    { action: 'syncOrders', key: 'orders', icon: Receipt, title: 'Commandes', desc: 'Commandes WooCommerce + lignes (livres par legacy, clients rattachés).' },
    { action: 'syncBooks', key: 'books', icon: BookOpen, title: 'Livres', desc: 'Fiches livres (ISBN, prix, dates, stock) + contributions auteur/traducteur/préface.' },
    { action: 'syncAuthors', key: 'authors', icon: UsersThree, title: 'Auteurs', desc: 'Auteurs (prénom / nom / slug).' },
    { action: 'syncArticles', key: 'articles', icon: Article, title: 'Articles', desc: "Articles d'Antichambre (corps, rubrique, auteurs, LettrInfo)." },
    { action: 'syncEvents', key: 'events', icon: CalendarDots, title: 'Rencontres', desc: 'Rencontres + lieux géolocalisés (dédupliqués), auteurs & livres liés.' }
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

  <!-- Traceurs & consentement -->
  <form method="POST" action="?/tracking" use:enhance class="rounded-lg border border-border bg-card p-5 lg:col-span-2">
    <h3 class="mb-1 text-base font-semibold">Traceurs & mesure d'audience</h3>
    <p class="mb-4 text-sm text-muted-foreground">Renseignez l'ID Google Tag Manager (recommandé — configurez GA4 et le Pixel Meta/Instagram dans GTM). Les traceurs ne se déclenchent qu'après consentement (CMP + Consent Mode v2). Les événements <span class="font-mono text-xs">add_to_cart</span>, <span class="font-mono text-xs">begin_checkout</span> et <span class="font-mono text-xs">purchase</span> sont poussés automatiquement dans le dataLayer.</p>
    <div class="grid gap-4 sm:grid-cols-3">
      <label><span class={label}>Google Tag Manager</span><input name="gtm_id" value={data.tracking.gtm_id} placeholder="GTM-XXXXXXX" class="{input} font-mono" /></label>
      <label><span class={label}>Google Analytics 4</span><input name="ga_id" value={data.tracking.ga_id} placeholder="G-XXXXXXXXXX" class="{input} font-mono" /></label>
      <label><span class={label}>Meta Pixel (Instagram)</span><input name="meta_pixel_id" value={data.tracking.meta_pixel_id} placeholder="123456789012345" class="{input} font-mono" /></label>
    </div>
    <p class="mt-2 text-xs text-muted-foreground">GA4 et Meta Pixel ne sont chargés directement que si aucun ID GTM n'est fourni (sinon, placez-les comme tags dans GTM).</p>
    <div class="mt-4"><Button type="submit"><FloppyDisk size={16} /> Enregistrer</Button></div>
  </form>

  <!-- Facturation -->
  <form method="POST" action="?/billing" use:enhance class="rounded-lg border border-border bg-card p-5 lg:col-span-2">
    <h3 class="mb-1 text-base font-semibold">Facturation</h3>
    <p class="mb-4 text-sm text-muted-foreground">Mentions légales figurant sur les factures et avoirs (émetteur : Éditions Agone).</p>
    <div class="grid gap-4 sm:grid-cols-2">
      <label class="sm:col-span-2"><span class={label}>Raison sociale</span><input name="legal_name" value={data.company.legal_name} class={input} /></label>
      <label class="sm:col-span-2"><span class={label}>Adresse (une ligne par retour)</span><textarea name="address" rows="3" class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">{data.company.address}</textarea></label>
      <label><span class={label}>SIRET</span><input name="siret" value={data.company.siret ?? ''} class={input} /></label>
      <label><span class={label}>N° TVA intracom.</span><input name="vat_number" value={data.company.vat_number ?? ''} class={input} /></label>
      <label><span class={label}>RCS</span><input name="rcs" value={data.company.rcs ?? ''} class={input} /></label>
      <label><span class={label}>Code APE</span><input name="ape" value={data.company.ape ?? ''} class={input} /></label>
      <label><span class={label}>IBAN</span><input name="iban" value={data.company.iban ?? ''} class={input} /></label>
      <label><span class={label}>BIC</span><input name="bic" value={data.company.bic ?? ''} class={input} /></label>
      <label><span class={label}>Email</span><input name="email" type="email" value={data.company.email ?? ''} class={input} /></label>
      <label><span class={label}>Téléphone</span><input name="phone" value={data.company.phone ?? ''} class={input} /></label>
      <label><span class={label}>Capital social</span><input name="capital" value={data.company.capital ?? ''} class={input} placeholder="ex. 10 000 €" /></label>
      <label><span class={label}>TVA par défaut (%)</span><input name="vat_rate" value={String(data.company.vat_rate)} class={input} placeholder="5.5" /></label>
      <label class="sm:col-span-2"><span class={label}>Taux de TVA disponibles (séparés par des virgules)</span><input name="vat_rates" value={data.company.vat_rates.join(', ')} class={input} placeholder="5.5, 20, 10, 2.1, 0" /></label>
      <label class="sm:col-span-2"><span class={label}>Mention de pied de page</span><textarea name="footer" rows="2" class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" placeholder="Association loi 1901 · TVA non applicable…">{data.company.footer ?? ''}</textarea></label>
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
        <form
          method="POST"
          action="?/{t.action}"
          use:enhance={() => {
            enCours = { ...enCours, [t.key]: true };
            return async ({ update }) => {
              await update({ reset: false });
              enCours = { ...enCours, [t.key]: false };
            };
          }}
          class="rounded-lg border border-border bg-card p-4"
        >
          <div class="mb-2 flex items-center gap-2">
            <t.icon size={18} class="text-link" />
            <h4 class="font-semibold">{t.title}</h4>
          </div>
          <p class="mb-2 text-xs text-muted-foreground">{t.desc}</p>
          {#if enCours[t.key]}
            <p class="mb-3 flex items-center gap-1.5 text-xs font-medium text-link">
              <Spinner size={13} class="animate-spin" /> Import en cours — lecture de la base WordPress…
            </p>
            <div class="mb-3 h-0.5 w-full overflow-hidden rounded bg-muted">
              <div class="ag-sync-bar h-full w-1/3 bg-link"></div>
            </div>
          {:else}
            <p class="mb-3 text-xs {syncInfo(t.key).tone}">{syncInfo(t.key).label}</p>
          {/if}
          <div class="flex flex-wrap items-center gap-2">
            <label class="flex items-center gap-1.5 text-sm" title="Plafond de sécurité : nombre maximum d’enregistrements traités en une fois.">
              Max
              <input name="limit" type="number" value="500" min="1" max="5000" disabled={enCours[t.key]} class="h-9 w-20 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-50" />
            </label>
            <label class="flex items-center gap-1.5 text-sm text-muted-foreground">
              <input type="checkbox" name="dryRun" checked disabled={enCours[t.key]} class="size-4 rounded border-border" /> Simulation
            </label>
            <label class="flex items-center gap-1.5 text-sm text-muted-foreground" title="Ignore le dernier import et reprend tout depuis le début.">
              <input type="checkbox" name="full" class="size-4 rounded border-border" disabled={t.key === 'users' || enCours[t.key]} /> Tout
            </label>
            {#if enCours[t.key]}
              <Button type="submit" variant="outline" size="sm" disabled class="ml-auto">
                <Spinner size={15} class="animate-spin" /> Import en cours…
              </Button>
            {:else}
              <Button type="submit" variant="outline" size="sm" class="ml-auto"><DownloadSimple size={15} /> Synchroniser</Button>
            {/if}
          </div>
        </form>
      {/each}
    </div>
    <p class="mt-3 text-xs text-muted-foreground">
      Par défaut, seuls les enregistrements <strong>modifiés depuis le dernier import</strong> sont repris
      (date <span class="font-mono">post_modified_gmt</span> de WordPress) ; cocher « Tout » ignore ce repère.
      « Max » n'est qu'un plafond de sécurité : si un lot l'atteint, relancer reprend là où on s'est arrêté.
      Ordre conseillé pour un import complet : Auteurs → Livres → Articles → Rencontres
      (les liens s'appuient sur les auteurs/livres déjà présents).
    </p>
  {/if}
</div>

<style>
  /* Va-et-vient plutôt qu'une progression : la durée d'un import n'est pas
     connue à l'avance, une barre qui se remplirait mentirait. */
  @keyframes ag-sync {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(300%); }
  }
  .ag-sync-bar { animation: ag-sync 1.1s ease-in-out infinite; }
</style>
