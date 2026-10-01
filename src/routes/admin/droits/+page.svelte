<script lang="ts">
  /**
   * Droits d'auteur — l'exercice en une page.
   *
   * Quatre tuiles, dans l'ordre du travail : les contrats (qui ouvre droit à
   * quoi), les ventes relevées (sur quoi on calcule), la reddition (ce qu'on
   * doit), les cessions (ce qui vient d'ailleurs). Chaque tuile mène à sa page.
   * Dessous, les ventes canal par canal ; les réglages sont repliés.
   */
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { FileText, Receipt, Coins, Globe, FloppyDisk, Warning, CheckCircle, ArrowRight } from 'phosphor-svelte';
  let { data } = $props();

  const r = $derived(data.recap);
  const eur = (n: number) => `${(n ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  const nb = (n: number) => (n ?? 0).toLocaleString('fr-FR');
  /** L'année en cours n'est pas finie : ses chiffres restent provisoires. */
  const enCours = $derived(r.annee >= new Date().getUTCFullYear());

  type Etat = 'ok' | 'attention' | 'neutre';
  const tuiles = $derived([
    {
      href: '/admin/droits/contrats', icon: FileText, titre: 'Contrats',
      chiffre: nb(r.contrats.actifs), unite: `contrat${r.contrats.actifs > 1 ? 's' : ''} actif${r.contrats.actifs > 1 ? 's' : ''}`,
      ligne: `${nb(r.contrats.livres_sous_contrat)} titres sous contrat${r.contrats.brouillons ? ` · ${nb(r.contrats.brouillons)} en brouillon` : ''}`,
      etat: (r.contrats.livres_sans_contrat ? 'attention' : r.contrats.livres_vendus ? 'ok' : 'neutre') as Etat,
      statut: r.contrats.livres_sans_contrat
        ? `${nb(r.contrats.livres_sans_contrat)} titres vendus en ${r.annee} sans contrat`
        : r.contrats.livres_vendus ? 'tous les titres vendus sont sous contrat' : 'aucune vente relevée'
    },
    {
      href: `/admin/droits/ventes?annee=${r.annee}`, icon: Receipt, titre: 'Ventes relevées',
      chiffre: nb(r.ventes.net), unite: 'ex. nets',
      ligne: `${eur(r.ventes.ca_ht)} prix public HT · ${nb(r.ventes.titres)} titres${r.mouvements.titres ? ` · stock suivi sur ${nb(r.mouvements.titres)}` : ''}`,
      etat: (r.ventes.mois_couverts === 12 ? 'ok' : 'attention') as Etat,
      statut: r.ventes.mois_couverts === 12
        ? enCours ? 'exercice en cours, chiffres provisoires' : 'les douze mois sont relevés'
        : `${r.ventes.mois_couverts}/12 mois relevés`
    },
    {
      href: '/admin/droits/reddition', icon: Coins, titre: 'Reddition',
      chiffre: eur(r.redditions.a_payer), unite: 'à payer',
      ligne: `${r.redditions.total} auteur${r.redditions.total > 1 ? 's' : ''} · ${eur(r.redditions.du)} dus${r.redditions.reporte ? ` · ${eur(r.redditions.reporte)} reportés` : ''}`,
      etat: (r.redditions.total === 0 ? 'neutre' : r.redditions.brouillons ? 'attention' : 'ok') as Etat,
      statut: r.redditions.total === 0
        ? 'exercice pas encore arrêté'
        : r.redditions.brouillons ? `${r.redditions.brouillons} brouillon${r.redditions.brouillons > 1 ? 's' : ''} à émettre` : `${r.redditions.emises} émise(s) · ${r.redditions.payees} payée(s)`
    },
    {
      href: '/admin/droits/cessions', icon: Globe, titre: 'Cessions',
      chiffre: eur(r.cessions.encaisse), unite: 'encaissés',
      ligne: `${eur(r.cessions.du_aux_auteurs)} aux auteurs · ${r.cessions.actives} cession${r.cessions.actives > 1 ? 's' : ''} en cours`,
      etat: (r.cessions.en_attente ? 'attention' : 'neutre') as Etat,
      statut: r.cessions.en_attente ? `${eur(r.cessions.en_attente)} d’échéances à pointer` : 'rien en attente'
    }
  ]);
  const TEINTE: Record<Etat, string> = { ok: 'text-success', attention: 'text-amber-700 dark:text-amber-500', neutre: 'text-muted-foreground' };
</script>

<svelte:head><title>Droits d’auteur · Admin</title></svelte:head>

<div class="mb-5 flex flex-wrap items-end justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">Droits d’auteur</h2>
    <p class="mt-1 text-sm text-muted-foreground">L’exercice {r.annee} en un coup d’œil. Chaque tuile ouvre sa page.</p>
  </div>
  <div class="flex flex-wrap items-center gap-1.5">
    <span class="mr-1 text-xs text-muted-foreground">Exercice</span>
    {#each r.annees as a (a)}
      <a href="/admin/droits?annee={a}"
        class="rounded-full border px-3 py-1 text-sm font-medium {a === r.annee ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-primary hover:text-foreground'}">{a}</a>
    {/each}
  </div>
</div>

<!-- ── L'exercice en quatre tuiles, dans l'ordre du travail ─────────────── -->
<div class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
  {#each tuiles as t (t.href)}
    <a href={t.href} class="group rounded-lg border bg-card p-5 transition-colors hover:border-primary {t.etat === 'attention' ? 'border-amber-500/40' : 'border-border'}">
      <div class="mb-3 flex items-center justify-between">
        <span class="inline-flex items-center gap-2 text-sm font-semibold group-hover:text-link"><t.icon size={18} class="text-link" /> {t.titre}</span>
        <ArrowRight size={14} class="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <p class="text-2xl font-bold tabular-nums">{t.chiffre} <span class="text-sm font-normal text-muted-foreground">{t.unite}</span></p>
      <p class="mt-1 text-sm text-muted-foreground">{t.ligne}</p>
      <p class="mt-2 inline-flex items-center gap-1 text-xs {TEINTE[t.etat]}">
        {#if t.etat === 'ok'}<CheckCircle size={12} weight="fill" />{:else if t.etat === 'attention'}<Warning size={12} weight="fill" />{/if}
        {t.statut}
      </p>
    </a>
  {/each}
</div>

<!-- ── Ventes par canal, en bref ──────────────────────────────────────────── -->
<div class="mb-6 overflow-hidden rounded-lg border border-border bg-card">
  <div class="flex items-baseline justify-between border-b border-border px-5 py-3">
    <h3 class="text-sm font-semibold">Ventes {r.annee} par canal</h3>
    <a href="/admin/droits/ventes?annee={r.annee}" class="text-xs text-link hover:underline">Le détail, ligne par ligne</a>
  </div>
  <table class="w-full text-sm">
    <tbody class="divide-y divide-border">
      {#each data.channels as c (c.id)}
        {@const chiffres = r.ventes.canaux.find((x) => x.code === c.code)}
        <tr>
          <td class="px-5 py-2.5 font-medium">{c.name}</td>
          <td class="px-3 py-2.5 text-right tabular-nums">{#if chiffres}{nb(chiffres.vendus - chiffres.retours)} ex.{:else}<span class="text-muted-foreground">—</span>{/if}</td>
          <td class="px-5 py-2.5 text-right tabular-nums text-muted-foreground">{#if chiffres}{eur(chiffres.ca_ht)} HT{/if}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<!-- ── Réglages, repliés : on n'y touche pas tous les jours ─────────────── -->
<details class="rounded-lg border border-border bg-card">
  <summary class="cursor-pointer px-5 py-3 text-sm font-semibold">Règles de calcul
    <span class="font-normal text-muted-foreground">— provision {data.reglages.provision_rate} %, seuil {data.reglages.threshold} €</span>
  </summary>
  <div class="border-t border-border px-5 py-4">
    <form method="POST" action="?/reglages" use:enhance class="flex flex-wrap items-end gap-3">
      <label class="text-xs font-medium text-muted-foreground" title="Retenue sur les ventes papier de l’exercice, reprise l’exercice suivant. Se règle aussi livre par livre.">
        Provision sur retours (%)
        <input name="provision_rate" type="number" step="1" min="0" max="100" value={data.reglages.provision_rate}
          class="mt-1 h-10 w-28 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary" />
      </label>
      <label class="text-xs font-medium text-muted-foreground" title="Sous ce montant, le net n’est pas versé : il est reporté sur l’exercice suivant.">
        Seuil de paiement (€)
        <input name="threshold" type="number" step="1" min="0" value={data.reglages.threshold}
          class="mt-1 h-10 w-28 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary" />
      </label>
      <label class="text-xs font-medium text-muted-foreground" title="Proposé sur chaque livre : le directeur de collection a son propre contrat, comme tout contributeur.">
        Directeur de collection par défaut
        <select name="directeur_defaut"
          class="mt-1 h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary">
          <option value="">— aucun —</option>
          {#each data.directeurs as u (u.id)}
            <option value={u.id} selected={data.reglages.directeur_defaut === u.id}>{u.full_name} · {u.role === 'admin' ? 'admin' : 'éditeur'}</option>
          {/each}
        </select>
      </label>
      <Button type="submit" variant="outline"><FloppyDisk size={15} /> Enregistrer</Button>
    </form>
    <p class="mt-4 text-xs text-muted-foreground">
      Le reste est contractuel et ne se règle pas : assiette au prix public HT (prix payé HT pour le numérique), barèmes progressifs sur le cumul
      des ventes, taux réduit de moitié hors France, SP et exemplaires d’auteur hors droits, à-valoir amorti à l’émission, comptes arrêtés au 31 décembre.
    </p>
  </div>
</details>
