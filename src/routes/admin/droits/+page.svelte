<script lang="ts">
  /**
   * Droits d'auteur — récapitulatif d'un exercice.
   *
   * Tout se lit par année : ce qui a été relevé, ce qui a été calculé, ce qui
   * reste à faire. Les pages de travail (contrats, ventes, reddition, cessions)
   * sont accessibles depuis les tuiles.
   */
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { FileText, Receipt, Coins, Globe, FloppyDisk, Warning, CheckCircle } from 'phosphor-svelte';
  let { data } = $props();

  const r = $derived(data.recap);
  const eur = (n: number) => `${(n ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  const nb = (n: number) => (n ?? 0).toLocaleString('fr-FR');
  /** L'année en cours n'est pas finie : ses chiffres restent provisoires. */
  const enCours = $derived(r.annee >= new Date().getUTCFullYear());

  const sections = $derived([
    { href: '/admin/droits/contrats', title: 'Contrats', desc: 'Barèmes par paliers, à-valoir, avenants — par livre et contributeur.', n: data.stats.contracts, icon: FileText },
    { href: '/admin/droits/ventes', title: 'Ventes de l’exercice', desc: 'Relevé en un geste : librairie, site, mouvements de stock.', n: data.stats.reports, icon: Receipt },
    { href: '/admin/droits/reddition', title: 'Reddition de comptes', desc: 'Droits dus par auteur, PDF à envoyer.', n: data.stats.statements, icon: Coins },
    { href: '/admin/droits/cessions', title: 'Cessions de droits', desc: 'Droits vendus à l’étranger et droits acquis.', n: data.stats.cessions, icon: Globe }
  ]);

  /** D'où vient chaque canal : c'est ce qui explique les doubles comptages évités. */
  const PROVENANCE: Record<string, { texte: string; auto: boolean }> = {
    bldd: { texte: 'Importé de l’extranet Belles Lettres (ventes, retours, chiffre facturé).', auto: true },
    web: { texte: 'Reconstruit depuis les commandes du site — numérique seul : le papier est expédié et facturé par Les Belles Lettres.', auto: true },
    vpc: { texte: 'Reconstruit depuis les commandes — numérique seul, comme le site.', auto: true },
    comptoir: { texte: 'Reconstruit depuis les commandes encaissées au comptoir et en rencontre.', auto: true },
    sortie_editeur: { texte: 'Reconstruit depuis les commandes de sortie éditeur.', auto: true }
  };
</script>

<svelte:head><title>Droits d’auteur · Admin</title></svelte:head>

<div class="mb-5 flex flex-wrap items-end justify-between gap-3">
  <div>
    <p class="eyebrow">Back-office</p>
    <h2 class="mt-1 text-xl font-bold">Droits d’auteur</h2>
    <p class="mt-1 text-sm text-muted-foreground">Contrats à paliers, ventes multi-canaux, cessions, reddition de comptes.</p>
  </div>
  <!-- Tout le récapitulatif se lit exercice par exercice. -->
  <div class="flex flex-wrap items-center gap-1.5">
    <span class="mr-1 text-xs text-muted-foreground">Exercice</span>
    {#each r.annees as a (a)}
      <a href="/admin/droits?annee={a}"
        class="rounded-full border px-3 py-1 text-sm font-medium {a === r.annee ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-primary hover:text-foreground'}">{a}</a>
    {/each}
  </div>
</div>

<!-- ── L'exercice en quatre chiffres ─────────────────────────────────────── -->
<div class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
  <div class="rounded-lg border border-border bg-card p-5">
    <h3 class="eyebrow mb-2">Ventes relevées</h3>
    <p class="text-2xl font-bold tabular-nums">{nb(r.ventes.net)} <span class="text-sm font-normal text-muted-foreground">ex. nets</span></p>
    <p class="mt-1 text-sm text-muted-foreground">{nb(r.ventes.vendus)} vendus · {nb(r.ventes.retours)} retours · {nb(r.ventes.titres)} titres</p>
    <p class="mt-1 text-sm">{eur(r.ventes.ca_ht)} <span class="text-xs text-muted-foreground">prix public HT</span></p>
    <p class="mt-2 text-xs {r.ventes.mois_couverts === 12 ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-500'}">
      {#if r.ventes.mois_couverts === 12 && enCours}
        <CheckCircle size={12} weight="fill" class="inline" /> exercice en cours — chiffres provisoires jusqu’au 31 décembre
      {:else if r.ventes.mois_couverts === 12}
        <CheckCircle size={12} weight="fill" class="inline" /> les douze mois sont relevés
      {:else}
        <Warning size={12} weight="fill" class="inline" /> {r.ventes.mois_couverts}/12 mois relevés —
        <a href="/admin/droits/ventes" class="underline">compléter</a>
      {/if}
    </p>
  </div>

  <div class="rounded-lg border border-border bg-card p-5">
    <h3 class="eyebrow mb-2">Stocks (Belles Lettres)</h3>
    <p class="text-2xl font-bold tabular-nums">{nb(r.mouvements.titres)} <span class="text-sm font-normal text-muted-foreground">titres suivis</span></p>
    <p class="mt-1 text-sm text-muted-foreground">{nb(r.mouvements.fabriques)} ex. entrés · {nb(r.mouvements.sp)} SP &amp; gratuits</p>
    <p class="mt-2 text-xs text-muted-foreground">
      {r.mouvements.titres ? 'Mentions imposées par l’article 6 des contrats.' : 'Aucun relevé de mouvements sur cet exercice.'}
    </p>
  </div>

  <div class="rounded-lg border border-border bg-card p-5">
    <h3 class="eyebrow mb-2">Reddition</h3>
    <p class="text-2xl font-bold tabular-nums">{eur(r.redditions.a_payer)} <span class="text-sm font-normal text-muted-foreground">à payer</span></p>
    <p class="mt-1 text-sm text-muted-foreground">{r.redditions.total} auteur(s) · {eur(r.redditions.du)} dus{r.redditions.reporte ? ` · ${eur(r.redditions.reporte)} reportés` : ''}</p>
    <p class="mt-2 text-xs {r.redditions.brouillons ? 'text-amber-700 dark:text-amber-500' : 'text-muted-foreground'}">
      {#if r.redditions.total === 0}
        Aucune reddition — <a href="/admin/droits/reddition" class="underline">arrêter l’exercice</a>
      {:else}
        {r.redditions.brouillons} brouillon(s) · {r.redditions.emises} émise(s) · {r.redditions.payees} payée(s)
      {/if}
    </p>
  </div>

  <div class="rounded-lg border border-border bg-card p-5">
    <h3 class="eyebrow mb-2">Cessions</h3>
    <p class="text-2xl font-bold tabular-nums">{eur(r.cessions.encaisse)} <span class="text-sm font-normal text-muted-foreground">encaissés</span></p>
    <p class="mt-1 text-sm text-muted-foreground">
      dont {eur(r.cessions.du_aux_auteurs)} aux auteurs{r.cessions.a_payer ? ` · ${eur(r.cessions.a_payer)} versés aux ayants droit` : ''}
    </p>
    <p class="mt-2 text-xs {r.cessions.en_attente ? 'text-amber-700 dark:text-amber-500' : 'text-muted-foreground'}">
      {r.cessions.en_attente ? `${eur(r.cessions.en_attente)} d’échéances non pointées` : `${r.cessions.actives} cession(s) en cours`}
    </p>
  </div>
</div>

<!-- ── Couverture contractuelle ──────────────────────────────────────────── -->
<div class="mb-6 rounded-lg border {r.contrats.livres_sans_contrat ? 'border-amber-500/40 bg-amber-500/5' : 'border-border bg-card'} p-5">
  <div class="flex flex-wrap items-baseline justify-between gap-3">
    <h3 class="eyebrow">Couverture contractuelle</h3>
    <a href="/admin/droits/contrats" class="text-xs text-link hover:underline">Voir les contrats</a>
  </div>
  <p class="mt-2 text-sm">
    {#if r.contrats.livres_sans_contrat}
      <strong class="text-amber-700 dark:text-amber-500">{nb(r.contrats.livres_sans_contrat)} titres vendus en {r.annee} n’ont aucun contrat</strong>
      — aucun droit ne sera calculé pour eux.
    {:else if r.contrats.livres_vendus}
      Tous les titres vendus en {r.annee} sont sous contrat.
    {:else}
      Aucune vente relevée sur cet exercice.
    {/if}
  </p>
  <p class="mt-1 text-sm text-muted-foreground">
    {nb(r.contrats.total)} contrats en tout ({nb(r.contrats.actifs)} actifs, {nb(r.contrats.brouillons)} en brouillon)
    sur {nb(r.contrats.livres_sous_contrat)} titres · {nb(r.contrats.livres_vendus)} titres vendus sur l’exercice.
  </p>
  {#if r.contrats.brouillons}
    <p class="mt-1 text-xs text-muted-foreground">Un contrat en brouillon n’ouvre droit à rien tant qu’il n’est pas passé en actif.</p>
  {/if}
</div>

<!-- ── Les quatre espaces de travail ─────────────────────────────────────── -->
<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
  {#each sections as s (s.href)}
    <a href={s.href} class="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary">
      <div class="flex items-center justify-between">
        <span class="grid size-10 place-items-center rounded-lg bg-accent text-link"><s.icon size={20} /></span>
        <span class="text-2xl font-bold">{s.n}</span>
      </div>
      <h3 class="mt-3 font-semibold group-hover:text-link">{s.title}</h3>
      <p class="mt-1 text-sm text-muted-foreground">{s.desc}</p>
    </a>
  {/each}
</div>

<div class="mt-8 grid gap-6 lg:grid-cols-2">
  <!-- ── Canaux : d'où viennent les chiffres ─────────────────────────────── -->
  <div class="rounded-lg border border-border bg-card p-5">
    <h3 class="eyebrow mb-1">Canaux de vente</h3>
    <p class="mb-3 text-xs text-muted-foreground">
      Tous sont alimentés automatiquement par le relevé d’exercice. Le papier vendu sur le site ou en VPC est
      expédié et facturé par Les Belles Lettres : il n’est compté qu’une fois, dans leur relevé.
    </p>
    <ul class="space-y-3 text-sm">
      {#each data.channels as c (c.id)}
        {@const chiffres = r.ventes.canaux.find((x) => x.code === c.code)}
        <li class="border-b border-border pb-3 last:border-0 last:pb-0">
          <div class="flex items-baseline justify-between gap-3">
            <span class="font-medium">{c.name}</span>
            <span class="shrink-0 tabular-nums text-muted-foreground">
              {#if chiffres}{nb(chiffres.vendus - chiffres.retours)} ex. · {eur(chiffres.ca_ht)}{:else}<span class="text-xs">aucune vente en {r.annee}</span>{/if}
            </span>
          </div>
          <p class="mt-0.5 text-xs text-muted-foreground">{PROVENANCE[c.code]?.texte ?? 'Saisie manuelle.'}</p>
        </li>
      {/each}
    </ul>
  </div>

  <!-- ── Règles de calcul ─────────────────────────────────────────────────── -->
  <div class="rounded-lg border border-border bg-card p-5">
    <h3 class="eyebrow mb-1">Règles de calcul</h3>
    <p class="mb-3 text-xs text-muted-foreground">
      Valeurs par défaut de la maison. La provision se règle livre par livre depuis la page des contrats.
    </p>
    <form method="POST" action="?/reglages" use:enhance class="flex flex-wrap items-end gap-3">
      <label class="text-xs font-medium text-muted-foreground">
        Provision sur retours (%)
        <input name="provision_rate" type="number" step="1" min="0" max="100" value={data.reglages.provision_rate}
          class="mt-1 h-10 w-28 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary" />
      </label>
      <label class="text-xs font-medium text-muted-foreground">
        Seuil de paiement (€)
        <input name="threshold" type="number" step="1" min="0" value={data.reglages.threshold}
          class="mt-1 h-10 w-28 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary" />
      </label>
      <Button type="submit" variant="outline"><FloppyDisk size={15} /> Enregistrer</Button>
    </form>

    <!-- Ce que le moteur applique sans réglage : ce sont des clauses contractuelles. -->
    <ul class="mt-4 space-y-1.5 text-xs text-muted-foreground">
      <li>— Assiette : prix public <strong>HT</strong> pour le papier, prix réellement payé HT pour le numérique.</li>
      <li>— Barèmes <strong>progressifs</strong> sur le cumul des ventes du titre, avenants compris.</li>
      <li>— Ventes <strong>hors France</strong> : taux contractuel diminué de moitié.</li>
      <li>— Provision sur retours retenue sur les ventes papier, <strong>reprise l’exercice suivant</strong>.</li>
      <li>— Services de presse, exemplaires d’auteur et promotion : <strong>hors droits</strong>.</li>
      <li>— À-valoir amorti sur le brut, une seule fois, à l’émission de la reddition.</li>
      <li>— Sous le seuil, le net n’est pas versé : il est <strong>reporté</strong> sur l’exercice suivant.</li>
      <li>— Comptes arrêtés au 31 décembre, paiement dans les six mois.</li>
    </ul>
  </div>
</div>
