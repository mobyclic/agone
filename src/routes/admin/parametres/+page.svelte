<script lang="ts">
  import { onMount } from 'svelte';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import type { JobSynchro } from '$lib/server/sync-job';
  import { Button } from '$lib/components/ui/button';
  import { FloppyDisk, Users, UsersThree, Receipt, BookOpen, Article, CalendarDots, DownloadSimple, Warning, Spinner, CheckCircle, XCircle, ArrowRight, Image as ImageIcon } from 'phosphor-svelte';

  let { data, form } = $props();
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const label = 'mb-1 block text-sm font-medium';

  /**
   * Synchronisation : elle tourne en tâche de fond côté serveur (plusieurs
   * minutes possibles) ; la page en suit l'avancement toutes les 2 s.
   */
  let job = $state<JobSynchro | null>(null);
  let lancement = $state(false);
  const enCours = $derived(lancement || !!job?.enCours);
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  async function suivre() {
    clearTimeout(minuteur);
    try {
      const r = await fetch('/admin/api/sync');
      if (r.ok) job = await r.json();
    } catch { /* réseau : on réessaie au prochain tour */ }
    if (job?.enCours) minuteur = setTimeout(suivre, 2000);
    else if (job?.fin) invalidateAll(); // rafraîchit les « dernier import » affichés
  }
  onMount(() => { suivre(); return () => clearTimeout(minuteur); });

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

  // Même ordre que le serveur (ETAPES de sync-job.ts) : chaque étape s'appuie sur les précédentes.
  const etapes = [
    { key: 'authors', icon: UsersThree, title: 'Auteurs', desc: 'Prénom, nom, slug.' },
    { key: 'books', icon: BookOpen, title: 'Livres', desc: 'Fiches (ISBN, prix, dates, stock) + contributions → auteurs, couverture, collection.' },
    { key: 'covers', icon: ImageIcon, title: 'Couvertures & collections', desc: 'Rattrapage : livres encore sans couverture ou sans collection.' },
    { key: 'articles', icon: Article, title: 'Articles', desc: 'Antichambre : corps, rubrique, auteurs, livres, LettrInfo.' },
    { key: 'events', icon: CalendarDots, title: 'Rencontres', desc: 'Lieux géolocalisés, auteurs et livres liés.' },
    { key: 'users', icon: Users, title: 'Utilisateurs', desc: 'Clients WordPress → comptes.' },
    { key: 'orders', icon: Receipt, title: 'Commandes', desc: 'WooCommerce + lignes → comptes et livres.' },
    { key: 'library', icon: BookOpen, title: 'Bibliothèques ebook', desc: 'Droits d’accès des clients, déduits des commandes payées.' }
  ];
  const resultat = (key: string) => job?.etapes.find((e) => e.key === key);
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
  <form method="POST" action="?/stock" use:enhance class="rounded-lg border border-border bg-card p-5">
    <h3 class="eyebrow mb-1">Alerte de stock</h3>
    <p class="mb-3 text-xs text-muted-foreground">
      Au-dessous de ce nombre d'exemplaires, un livre en vente est signalé au réassort, sur le tableau de bord et
      dans le catalogue (filtre « Stock bas »). Le stock vient du relevé des Belles Lettres.
    </p>
    <label class={label}>Seuil (exemplaires)
      <input name="alert_threshold" type="number" min="0" step="1" value={data.stock.alert_threshold} class="{input} w-32" />
    </label>
    <div class="mt-4"><Button type="submit"><FloppyDisk size={16} /> Enregistrer</Button></div>
  </form>

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

  {#if !data.wpReady}
    <p class="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
      <Warning size={16} /> Connexion WordPress non configurée (<span class="font-mono text-xs">WP_DB_HOST / WP_DB_USER / WP_DB_PASS / WP_DB_NAME</span> dans .env).
    </p>
  {:else}
    <form
      method="POST"
      action="?/syncTout"
      use:enhance={() => {
        lancement = true;
        return async ({ update }) => { await update({ reset: false }); lancement = false; suivre(); };
      }}
      class="rounded-lg border border-border bg-card p-5"
    >
      <!-- Les six étapes, dans l'ordre d'exécution -->
      <ol class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {#each etapes as t, i (t.key)}
          {@const r = resultat(t.key)}
          <li class="flex gap-3 rounded-md border p-3 {r?.statut === 'erreur' ? 'border-destructive/40 bg-destructive/5' : r?.statut === 'fait' ? 'border-success/30 bg-success/5' : r?.statut === 'en_cours' ? 'border-link/40 bg-link/5' : 'border-border'}">
            <span class="grid size-7 shrink-0 place-items-center rounded-full bg-muted font-display text-sm font-bold">{i + 1}</span>
            <div class="min-w-0 flex-1">
              <p class="flex items-center gap-1.5 font-semibold"><t.icon size={16} class="text-link" /> {t.title}
                {#if r?.statut === 'erreur'}<XCircle size={16} class="text-destructive" weight="fill" />
                {:else if r?.statut === 'fait'}<CheckCircle size={16} class="text-success" weight="fill" />
                {:else if r?.statut === 'en_cours'}<Spinner size={15} class="animate-spin text-link" />{/if}
              </p>
              <p class="text-xs text-muted-foreground">{t.desc}</p>
              {#if r?.statut === 'erreur'}
                <p class="mt-1 text-xs font-medium text-destructive">{r.error}</p>
              {:else if r?.statut === 'annule'}
                <p class="mt-1 text-xs text-muted-foreground">Non lancée (une étape précédente a échoué).</p>
              {:else if r?.statut === 'attente' && job?.enCours}
                <p class="mt-1 text-xs text-muted-foreground">En attente…</p>
              {:else if r?.result}
                <p class="mt-1 text-xs font-medium">
                  {r.result.created} créé(s), {r.result.updated} mis à jour{#if r.result.skipped}, {r.result.skipped} ignoré(s){/if}
                  <span class="text-muted-foreground">({r.result.fetched} lus{r.lots > 1 ? ` · ${r.lots} lots` : ''}{r.statut === 'en_cours' ? '…' : ''})</span>
                </p>
                {#if r.result.warnings.length}
                  <details class="mt-1 text-xs text-muted-foreground">
                    <summary class="cursor-pointer">{r.result.warnings.length} avertissement(s)</summary>
                    <ul class="mt-1 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-4">{#each r.result.warnings as w (w)}<li>{w}</li>{/each}</ul>
                  </details>
                {/if}
              {:else}
                <p class="mt-1 text-[11px] {syncInfo(t.key).tone}">{syncInfo(t.key).label}</p>
              {/if}
            </div>
          </li>
        {/each}
      </ol>

      {#if job}
        <p class="mt-3 text-sm font-medium">
          {#if job.enCours}
            {job.dryRun ? 'Simulation' : 'Synchronisation'} en cours — vous pouvez quitter la page, elle continue.
          {:else}
            {job.dryRun ? 'Simulation terminée — rien n’a été écrit.' : 'Synchronisation terminée.'}
            {#if job.etapes.some((e) => e.statut === 'erreur')}<span class="text-destructive">Interrompue à l’étape en erreur (les suivantes en dépendent).</span>{/if}
          {/if}
        </p>
      {/if}

      {#if enCours}
        <div class="mt-4 h-0.5 w-full overflow-hidden rounded bg-muted"><div class="ag-sync-bar h-full w-1/3 bg-link"></div></div>
      {/if}

      <div class="mt-4 flex flex-wrap items-center gap-4 border-t border-border pt-4">
        <label class="flex items-center gap-1.5 text-sm" title="Nombre d’enregistrements lus par lot ; les lots s’enchaînent jusqu’à tout avoir lu.">
          Taille des lots
          <input name="limit" type="number" value="1000" min="50" max="5000" disabled={enCours} class="h-9 w-24 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-50" />
        </label>
        <label class="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="dryRun" checked disabled={enCours} class="size-4 rounded border-border" /> Simulation
        </label>
        <label class="flex items-center gap-1.5 text-sm text-muted-foreground" title="Ignore les repères des imports précédents et reprend tout depuis le début.">
          <input type="checkbox" name="full" disabled={enCours} class="size-4 rounded border-border" /> Tout réimporter
        </label>
        <Button type="submit" variant="brand" class="ml-auto" disabled={enCours}>
          {#if enCours}<Spinner size={16} class="animate-spin" /> Synchronisation en cours…{:else}<DownloadSimple size={16} /> Tout synchroniser <ArrowRight size={14} />{/if}
        </Button>
      </div>
    </form>
    <p class="mt-3 max-w-3xl text-xs text-muted-foreground">
      Par défaut, seuls les enregistrements <strong>modifiés depuis le dernier import</strong> sont repris
      (date <span class="font-mono">post_modified_gmt</span> de WordPress ; les comptes, non datés, sont toujours balayés en entier).
      Chaque étape lit par lots successifs jusqu'à avoir tout parcouru (50 lots au plus par étape).
      En simulation, une étape ne voit pas ce que les précédentes <em>auraient</em> créé : les chiffres des étapes aval sont indicatifs.
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
