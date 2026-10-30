<script lang="ts">
  /**
   * Le club des lecteurs : présentation et adhésion.
   * Manchette (promesse, chiffres clés, adhésion, carte de membre), avantages, le fonds
   * au prix membre (vrais titres, règle du panier), mode d'emploi, questions, rappel final.
   * Tous les chiffres viennent des réglages du club : la page suit le back-office.
   */
  import { enhance } from '$app/forms';
  import SectionHead from '$lib/components/SectionHead.svelte';
  import Wordmark from '$lib/components/Wordmark.svelte';
  import { authorList, euros } from '$lib/labels';
  import { Plus, ArrowRight, CheckCircle } from 'phosphor-svelte';
  let { data, form } = $props();
  const c = $derived(data.club);

  const dateFr = (s: string) => new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  /** 50 → « 50 € » ; 49,5 → « 49,50 € ». */
  const prixCourt = (n: number) => (Number.isInteger(n) ? `${n} €` : (euros(n) ?? ''));
  const prix = $derived(prixCourt(c.prix_ttc));
  const tva = $derived(String(c.tva).replace('.', ','));
  const parPeriode = $derived(c.duree_mois === 12 ? 'par an' : `pour ${c.duree_mois} mois`);
  const periode = $derived(c.duree_mois === 12 ? 'an' : `${c.duree_mois} mois`);
  const ans = $derived(`${c.fond_ans} an${c.fond_ans > 1 ? 's' : ''}`);
  const titres = $derived(data.titresFonds ? data.titresFonds.toLocaleString('fr-FR') : '');

  const avantages = $derived([
    { chiffre: `−${c.remise} %`, titre: 'Sur tout le fonds', texte: `Les livres parus depuis plus de ${ans}${titres ? ` (${titres} titres aujourd'hui)` : ''}, en papier comme en numérique, toute l'année.` },
    ...(c.franco !== 'non'
      ? [{ chiffre: '0 €', titre: 'Frais de port offerts', texte: c.franco === 'toujours' ? 'Sur toutes vos commandes de livres papier.' : 'Sur toute commande qui comprend une nouveauté.' }]
      : []),
    { chiffre: c.duree_mois === 12 ? '1 an' : `${c.duree_mois} mois`, titre: 'Sans engagement', texte: `Renouvelée d'elle-même, arrêtée quand vous voulez ; nous vous prévenons ${data.rappelJours} jours avant chaque échéance.` },
    { chiffre: '', titre: 'Une maison indépendante', texte: 'Votre adhésion soutient directement le travail d’une maison d’édition indépendante : ses livres, ses auteurs, ses rencontres.' }
  ]);

  const questions = $derived([
    { q: 'Quels livres profitent de la remise ?', r: `Tous les livres parus depuis plus de ${ans}, en papier comme en numérique. Les nouveautés restent au prix public${c.franco === 'nouveautes' ? ', mais elles vous valent le port offert' : ''}.` },
    { q: 'Comment la remise s’applique-t-elle ?', r: 'Toute seule : connecté·e avec le compte de votre adhésion, les livres du fonds sont remisés dans le panier, sans code à saisir.' },
    { q: 'Comment fonctionne le renouvellement ?', r: `L'adhésion se renouvelle d'elle-même tous les ${periode === 'an' ? 'ans' : periode}, au même tarif, et nous vous écrivons ${data.rappelJours} jours avant chaque échéance. Déjà membre ? Rien n'est prélevé avant la fin de votre adhésion en cours.` },
    { q: 'Puis-je l’arrêter quand je veux ?', r: 'Oui. Sur cette page, « Gérer mon abonnement » ouvre votre espace de paiement : vous y arrêtez le renouvellement en un clic, et votre adhésion reste valable jusqu’à son terme.' },
    { q: 'Vais-je recevoir une facture ?', r: 'Oui : chaque période d’adhésion donne lieu à une facture d’Agone, et vos reçus de paiement restent consultables depuis « Gérer mon abonnement ».' },
    { q: 'Puis-je offrir une adhésion ?', r: 'Avec plaisir : écrivez-nous, nous l’enregistrons au nom de la personne à qui vous l’offrez.', lien: { href: '/contact', label: 'Nous écrire' } }
  ]);

  let envoi = $state(false);
  const attendre = () => {
    envoi = true;
    return async ({ update }: { update: () => Promise<void> }) => { await update(); envoi = false; };
  };
</script>

<svelte:head>
  <title>{c.nom} · Agone</title>
  <meta name="description" content={`${c.nom} : −${c.remise} % sur le fonds, ${prix} ${parPeriode}. ${c.texte}`} />
</svelte:head>

<!-- Adhésion : le même bloc en tête de page et dans le rappel final (`sombre`). -->
{#snippet adhesion(sombre: boolean)}
  {#if data.merci && !sombre}
    <p class="mb-5 flex items-start gap-2 border-l-4 border-success bg-success/10 px-4 py-3 text-sm">
      <CheckCircle size={18} class="mt-0.5 shrink-0 text-success" />
      <span>Merci, et bienvenue au club ! Votre adhésion est enregistrée dès la confirmation du paiement ; la remise s'applique aussitôt à votre panier.</span>
    </p>
  {/if}
  {#if data.adhesion}
    <p class={sombre ? 'text-background/80' : 'text-base'}>
      Vous êtes membre jusqu'au <strong class={sombre ? 'text-background' : ''}>{dateFr(data.adhesion.ends_at)}</strong>{data.adhesion.auto_renew ? ', renouvellement automatique à cette date.' : '.'}
    </p>
    <div class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
      {#if !data.adhesion.auto_renew && data.paiementEnLigne}
        <form method="POST" action="?/adherer" use:enhance={attendre}>
          <button type="submit" disabled={envoi} class="h-11 border-2 px-5 font-display text-sm font-bold uppercase tracking-wide transition-colors disabled:opacity-60 {sombre ? 'border-background hover:bg-background hover:text-foreground' : 'border-foreground hover:bg-foreground hover:text-background'}">
            {envoi ? 'Redirection…' : 'Renouveler automatiquement'}
          </button>
        </form>
      {/if}
      <a href="/catalogue" class="inline-flex items-center gap-1.5 font-display text-sm font-semibold uppercase tracking-wide {sombre ? 'text-background hover:underline' : 'link'}">Parcourir le fonds <ArrowRight size={14} /></a>
      {#if data.portail}
        <form method="POST" action="?/gerer" use:enhance>
          <button type="submit" class="text-sm underline-offset-4 hover:underline {sombre ? 'text-background/70 hover:text-background' : 'text-muted-foreground hover:text-foreground'}">Gérer mon abonnement</button>
        </form>
      {/if}
    </div>
    {#if !data.adhesion.auto_renew && data.paiementEnLigne}
      <p class="mt-2 text-xs {sombre ? 'text-background/60' : 'text-muted-foreground'}">Rien n'est prélevé avant la fin de votre adhésion en cours.</p>
    {/if}
  {:else if !data.paiementEnLigne}
    <p class={sombre ? 'text-background/80' : ''}>
      L'adhésion en ligne ouvre très bientôt. Pour rejoindre le club dès maintenant,
      <a href="/contact" class="font-semibold underline underline-offset-4">écrivez-nous</a>.
    </p>
  {:else}
    <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
      {#if data.connecte}
        <form method="POST" action="?/adherer" use:enhance={attendre}>
          <button type="submit" disabled={envoi} class="inline-flex h-12 items-center gap-2 px-7 font-display text-base font-bold uppercase tracking-wide transition-colors disabled:opacity-60 {sombre ? 'bg-background text-foreground hover:bg-white/90' : 'btn-brand'}">
            {envoi ? 'Redirection vers le paiement…' : `Adhérer · ${prix}`}
          </button>
        </form>
      {:else}
        <a href="/connexion?next=/club" class="inline-flex h-12 items-center px-7 font-display text-base font-bold uppercase tracking-wide transition-colors {sombre ? 'bg-background text-foreground hover:bg-white/90' : 'btn-brand'}">Se connecter pour adhérer</a>
        <a href="/inscription?next=/club" class="text-sm font-medium underline-offset-4 hover:underline {sombre ? 'text-background' : 'text-link'}">ou créer un compte</a>
      {/if}
    </div>
    <p class="mt-3 text-xs {sombre ? 'text-background/60' : 'text-muted-foreground'}">
      {prix} TTC {parPeriode} (dont TVA {tva} %), réglés par carte · renouvelée automatiquement, sans engagement.
    </p>
  {/if}
  {#if form?.error}<p class="mt-3 text-sm {sombre ? 'text-background' : 'text-destructive'}">{form.error}</p>{/if}
{/snippet}

<!-- ── Manchette ─────────────────────────────────────────────── -->
<section class="border-b border-border" style="padding-inline: var(--page-gutter)">
  <div class="mx-auto grid max-w-6xl items-center gap-12 py-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16 lg:py-20">
    <div>
      <p class="tick-label">Adhérer à Agone</p>
      <h1 class="display-title mt-4 text-5xl sm:text-6xl lg:text-7xl">{c.nom}</h1>
      {#if c.texte}<p class="mt-6 max-w-xl text-lg leading-relaxed text-foreground/85">{c.texte}</p>{/if}

      <div class="mt-8 flex flex-wrap gap-x-10 gap-y-4 border-t-2 border-foreground pt-5">
        <div><p class="font-display text-4xl font-bold leading-none text-link">−{c.remise} %</p><p class="mt-1.5 text-sm text-muted-foreground">sur le fonds</p></div>
        {#if c.franco !== 'non'}
          <div><p class="font-display text-4xl font-bold leading-none">0 €</p><p class="mt-1.5 text-sm text-muted-foreground">de port{c.franco === 'nouveautes' ? ' avec une nouveauté' : ''}</p></div>
        {/if}
        <div><p class="font-display text-4xl font-bold leading-none">{prix}</p><p class="mt-1.5 text-sm text-muted-foreground">TTC {parPeriode}</p></div>
      </div>

      <div class="mt-8">{@render adhesion(false)}</div>
    </div>

    <!-- Carte de membre : au nom du visiteur connecté, datée pour un membre. -->
    <div class="mx-auto w-full max-w-md lg:max-w-none" aria-hidden="true">
      <div class="carte-membre relative aspect-[1.586/1] w-full overflow-hidden rounded-2xl bg-foreground p-6 text-background shadow-[0_30px_60px_-20px_rgba(0,0,0,0.45)] sm:p-8">
        <div class="bg-grid-fade absolute inset-0 opacity-50"></div>
        <div class="absolute inset-y-0 right-0 w-2.5 bg-link"></div>
        <div class="relative flex h-full flex-col justify-between">
          <div class="flex items-start justify-between gap-4">
            <Wordmark class="text-4xl sm:text-5xl" />
            <span class="pt-2 text-right font-display text-[11px] uppercase tracking-[0.22em] text-background/60">Carte<br />de membre</span>
          </div>
          <div>
            <p class="font-display text-xs uppercase tracking-[0.22em] text-background/60">{c.nom}</p>
            <p class="mt-1.5 truncate font-display text-2xl uppercase tracking-wide sm:text-3xl">{data.nom || (data.adhesion ? 'Membre' : 'Votre nom')}</p>
            <div class="mt-3 flex items-end justify-between gap-4 border-t border-background/20 pt-3 text-xs text-background/70">
              <span>{data.adhesion ? `Valable jusqu'au ${dateFr(data.adhesion.ends_at)}` : `${prix} ${parPeriode}`}</span>
              <span class="font-display text-lg font-bold leading-none text-background">−{c.remise} %</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ── Avantages ─────────────────────────────────────────────── -->
<section class="py-16" style="padding-inline: var(--page-gutter)">
  <div class="mx-auto max-w-6xl">
    <SectionHead title="Ce que vous offre le club" />
    <div class="grid gap-px border border-border bg-border sm:grid-cols-2 {avantages.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}">
      {#each avantages as a (a.titre)}
        <div class="bg-background p-6">
          {#if a.chiffre}
            <p class="font-display text-5xl font-bold leading-none text-link">{a.chiffre}</p>
          {:else}
            <Wordmark class="text-5xl leading-none text-link" />
          {/if}
          <h3 class="mt-5 font-display text-lg font-semibold uppercase tracking-wide">{a.titre}</h3>
          <p class="mt-2 text-sm leading-relaxed text-muted-foreground">{a.texte}</p>
        </div>
      {/each}
    </div>
  </div>
</section>

<!-- ── Le fonds au prix membre ───────────────────────────────── -->
{#if data.fonds.length}
  <section class="border-y border-border bg-muted/30 py-16" style="padding-inline: var(--page-gutter)">
    <div class="mx-auto max-w-6xl">
      <SectionHead title="Le fonds, au prix membre" href="/catalogue" more="Tout le catalogue" />
      <div class="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
        {#each data.fonds as b (b.slug)}
          <a href="/livre/{b.slug}" class="group block">
            <div class="aspect-[2/3] overflow-hidden border border-border bg-secondary/40 transition-colors group-hover:border-foreground">
              <img src={b.cover_url} alt={b.title} loading="lazy" class="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
            </div>
            <h3 class="mt-3 line-clamp-2 text-sm font-bold leading-snug group-hover:underline group-hover:underline-offset-4">{b.title}</h3>
            {#if b.authors?.length}<p class="mt-0.5 line-clamp-1 text-[13px] font-semibold text-link">{authorList(b.authors)}</p>{/if}
            <p class="mt-1.5 flex items-baseline gap-2 font-display">
              <span class="text-sm text-muted-foreground line-through">{euros(b.price_paper)}</span>
              <span class="text-lg font-bold">{euros(b.prix_membre)}</span>
            </p>
          </a>
        {/each}
      </div>
      <p class="mt-8 text-xs text-muted-foreground">Prix de l'édition papier. La remise vaut aussi pour les livres numériques du fonds.</p>
    </div>
  </section>
{/if}

<!-- ── Mode d'emploi ─────────────────────────────────────────── -->
<section class="py-16" style="padding-inline: var(--page-gutter)">
  <div class="mx-auto max-w-6xl">
    <SectionHead title="Comment ça marche" />
    <ol class="grid gap-10 md:grid-cols-3">
      <li>
        <span class="font-display text-7xl font-bold leading-none text-foreground/10">1</span>
        <h3 class="-mt-4 font-display text-xl font-semibold uppercase tracking-wide">Un compte Agone</h3>
        <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
          {data.connecte ? 'Vous êtes connecté·e : c’est ce compte qui portera votre adhésion.' : 'C’est lui qui porte l’adhésion : connectez-vous, ou créez-le en une minute.'}
        </p>
      </li>
      <li>
        <span class="font-display text-7xl font-bold leading-none text-foreground/10">2</span>
        <h3 class="-mt-4 font-display text-xl font-semibold uppercase tracking-wide">L'adhésion en ligne</h3>
        <p class="mt-2 text-sm leading-relaxed text-muted-foreground">{prix} TTC {parPeriode}, réglés par carte sur une page de paiement sécurisée.</p>
      </li>
      <li>
        <span class="font-display text-7xl font-bold leading-none text-foreground/10">3</span>
        <h3 class="-mt-4 font-display text-xl font-semibold uppercase tracking-wide">La remise, toute seule</h3>
        <p class="mt-2 text-sm leading-relaxed text-muted-foreground">Dès votre prochaine commande, les livres du fonds sont remisés dans le panier, sans code à saisir.</p>
      </li>
    </ol>
  </div>
</section>

<!-- ── Questions ─────────────────────────────────────────────── -->
<section class="pb-16" style="padding-inline: var(--page-gutter)">
  <div class="mx-auto max-w-6xl">
    <SectionHead title="Vos questions" />
    <div class="max-w-3xl divide-y divide-border border-b border-border">
      {#each questions as q (q.q)}
        <details class="group py-4">
          <summary class="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-medium uppercase tracking-wide [&::-webkit-details-marker]:hidden">
            {q.q}
            <Plus size={18} class="shrink-0 text-link transition-transform duration-200 group-open:rotate-45" />
          </summary>
          <p class="mt-3 text-sm leading-relaxed text-foreground/80">
            {q.r}
            {#if q.lien}<a href={q.lien.href} class="link ml-1 font-semibold">{q.lien.label} →</a>{/if}
          </p>
        </details>
      {/each}
    </div>
  </div>
</section>

<!-- ── Rappel final ──────────────────────────────────────────── -->
<section class="bg-foreground text-background" style="padding-inline: var(--page-gutter)">
  <div class="mx-auto flex max-w-6xl flex-col gap-8 py-14 md:flex-row md:items-center md:justify-between">
    <div>
      <p class="display-title text-4xl sm:text-5xl">{data.adhesion ? 'Merci d’être du club' : 'Rejoindre le club'}</p>
      <p class="mt-3 text-background/70">−{c.remise} % sur le fonds · {prix} TTC {parPeriode} · sans engagement</p>
    </div>
    <div class="md:max-w-md">{@render adhesion(true)}</div>
  </div>
</section>

<style>
  /* La carte penche à peine et se redresse au survol. */
  .carte-membre { transform: rotate(-2deg); transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1); }
  .carte-membre:hover { transform: rotate(0deg) translateY(-4px); }
  @media (prefers-reduced-motion: reduce) { .carte-membre, .carte-membre:hover { transform: none; transition: none; } }
</style>
