<script lang="ts">
  /**
   * Fenêtre d'aperçu d'un livre, ouverte depuis une grille (catalogue) : couverture,
   * début de la présentation, accès à la fiche, ajout au panier papier / ePub, et
   * flèches (boutons + ← →) pour parcourir les livres de la liste sans la quitter.
   *
   * `index` pilote l'ouverture (null = fermée). La présentation est chargée à la
   * demande depuis /api/livre/[slug] et gardée en cache ; les voisins sont
   * préchargés pour que la navigation reste instantanée.
   */
  import { enhance } from '$app/forms';
  import { invalidate } from '$app/navigation';
  import { fade, fly, scale } from 'svelte/transition';
  import { authorList, euros, isForthcoming } from '$lib/labels';
  import { trackAddToCart, itemId } from '$lib/analytics';
  import { X, CaretLeft, CaretRight, BookOpen, FileText, HandCoins, CheckCircle, CircleNotch } from 'phosphor-svelte';

  interface Livre {
    id: string; slug: string; title: string; subtitle?: string; cover_url?: string;
    price_paper?: number; price_ebook?: number; subscription_price?: number; subscription_end?: string;
    status?: string; published_at?: string;
    authors: { name: string; slug: string; first_name?: string; last_name?: string }[];
    collection?: { slug: string; name: string };
  }
  let { livres, index = $bindable(null) }: { livres: Livre[]; index?: number | null } = $props();

  const livre = $derived(index != null ? livres[index] : null);
  /** Sens du dernier déplacement, pour faire glisser le contenu du bon côté. */
  let sens = $state(1);

  // ── Résumés (cache) ──────────────────────────────────────────────────────
  const resumes = $state<Record<string, string | null>>({});
  async function charger(slug?: string) {
    if (!slug || slug in resumes) return;
    resumes[slug] = undefined as unknown as null; // marque « en cours » (évite les doublons)
    try {
      const r = await fetch(`/api/livre/${encodeURIComponent(slug)}`);
      resumes[slug] = r.ok ? ((await r.json()).resume ?? null) : null;
    } catch { resumes[slug] = null; }
  }
  $effect(() => {
    if (index == null) return;
    charger(livres[index]?.slug);
    charger(livres[index + 1]?.slug);
    charger(livres[index - 1]?.slug);
  });

  // ── Navigation ───────────────────────────────────────────────────────────
  function aller(delta: number) {
    if (index == null) return;
    const i = index + delta;
    if (i < 0 || i >= livres.length) return;
    sens = delta;
    ajoute = '';
    index = i;
  }
  const fermer = () => { index = null; ajoute = ''; };
  function clavier(e: KeyboardEvent) {
    if (index == null) return;
    if (e.key === 'Escape') fermer();
    else if (e.key === 'ArrowRight') aller(1);
    else if (e.key === 'ArrowLeft') aller(-1);
  }
  // Pas de défilement de la page derrière la fenêtre.
  $effect(() => {
    if (index == null) return;
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = avant; };
  });

  // ── Achat ────────────────────────────────────────────────────────────────
  const formats = $derived.by(() => {
    if (!livre) return [];
    if (isForthcoming(livre)) {
      return livre.subscription_price != null && livre.subscription_end
        ? [{ key: 'souscription', label: 'Souscrire', price: livre.subscription_price }]
        : [];
    }
    return [
      livre.price_paper != null ? { key: 'papier', label: 'Papier', price: livre.price_paper } : null,
      livre.price_ebook != null ? { key: 'epub', label: 'ePub', price: livre.price_ebook } : null
    ].filter((x): x is { key: string; label: string; price: number } => x !== null);
  });
  let enCours = $state('');
  let ajoute = $state('');
  function ajouter({ formData }: { formData: FormData }) {
    const f = formats.find((x) => x.key === formData.get('format'));
    const l = livre;
    enCours = String(formData.get('format') ?? '');
    return async ({ result, update }: any) => {
      if (result.type === 'redirect') {
        if (l) trackAddToCart({ item_id: itemId(l.id), item_name: l.title, price: f?.price ?? 0, quantity: 1, item_variant: f?.label, item_category: l.collection?.name });
        // Ne rafraîchit que le compteur du panier : la fenêtre reste ouverte.
        await invalidate('app:cart');
        ajoute = enCours;
      } else await update();
      enCours = '';
    };
  }
  const parution = $derived(
    livre?.published_at ? new Date(livre.published_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
  );
</script>

<svelte:window onkeydown={clavier} />

{#if livre}
  <div class="fixed inset-0 z-[70] grid place-items-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Aperçu : {livre.title}">
    <button type="button" class="absolute inset-0 cursor-default bg-black/60" aria-label="Fermer" onclick={fermer} transition:fade={{ duration: 150 }}></button>

    <!-- Fiche encadrée de ses deux flèches (la première grisée sur le premier livre,
         la dernière sur le dernier). -->
    <div class="relative z-10 flex w-full max-w-[64rem] items-center gap-2 sm:gap-4">
    {@render fleche(-1)}
    <div class="relative max-h-[92svh] min-w-0 flex-1 overflow-y-auto border border-border bg-background shadow-2xl"
      transition:scale={{ duration: 200, start: 0.96, opacity: 0 }}>
      <button type="button" onclick={fermer} class="absolute right-3 top-3 z-10 grid size-9 place-items-center bg-background/90 text-muted-foreground hover:text-foreground" aria-label="Fermer">
        <X size={20} />
      </button>

      {#key livre.slug}
        <div class="grid gap-6 p-5 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)] sm:items-start sm:gap-8 sm:p-8"
          in:fly={{ x: 40 * sens, duration: 220, opacity: 0 }}>
          <a href="/livre/{livre.slug}" class="mx-auto block w-full max-w-[260px] border border-border bg-muted">
            {#if livre.cover_url}
              <img src={livre.cover_url} alt={livre.title} class="block aspect-[2/3] w-full object-cover" />
            {:else}
              <span class="flex aspect-[2/3] items-end bg-ink p-4"><span class="font-display text-lg uppercase leading-tight text-white">{livre.title}</span></span>
            {/if}
          </a>

          <div class="min-w-0">
            {#if livre.collection}
              <p class="font-display text-xs font-medium uppercase tracking-wide text-muted-foreground">{livre.collection.name}</p>
            {/if}
            <h2 class="display-title mt-1 pr-8 text-2xl leading-tight sm:text-3xl">{livre.title}</h2>
            {#if livre.subtitle}<p class="mt-1.5 leading-snug text-muted-foreground">{livre.subtitle}</p>{/if}
            {#if livre.authors.length}
              <p class="mt-2 font-display text-lg font-semibold uppercase tracking-wide text-link">{authorList(livre.authors)}</p>
            {/if}
            {#if isForthcoming(livre) && parution}
              <p class="mt-3 inline-block bg-link px-2.5 py-1 font-display text-xs font-semibold uppercase tracking-wide text-white">En librairie le {parution}</p>
            {/if}

            <div class="mt-4 min-h-[6rem] text-[15px] leading-relaxed text-foreground/85">
              {#if resumes[livre.slug]}
                <p class="texte-justifie">{resumes[livre.slug]}</p>
              {:else if resumes[livre.slug] === undefined}
                <div class="space-y-2" aria-hidden="true">
                  {#each [100, 96, 98, 70] as w (w)}<div class="h-3.5 animate-pulse bg-muted" style="width:{w}%"></div>{/each}
                </div>
              {/if}
            </div>

            <!-- Achat + accès à la fiche, sur une même ligne -->
            <div class="mt-5 flex flex-wrap items-center gap-2.5">
              {#each formats as f (f.key)}
                  <form method="POST" action="/panier?/add" use:enhance={ajouter}>
                    <input type="hidden" name="id" value={livre.id} />
                    <input type="hidden" name="format" value={f.key} />
                    <input type="hidden" name="qty" value="1" />
                    <button type="submit" disabled={enCours === f.key}
                      class="flex items-center gap-2 border-2 px-3.5 py-2 font-display text-sm font-bold uppercase tracking-wide transition-colors disabled:cursor-wait disabled:opacity-70 {ajoute === f.key ? 'border-success bg-success text-white' : 'border-foreground hover:bg-foreground hover:text-background'}">
                      {#if enCours === f.key}<CircleNotch size={18} weight="bold" class="animate-spin" />
                      {:else if ajoute === f.key}<CheckCircle size={18} weight="fill" />
                      {:else if f.key === 'epub'}<FileText size={18} />
                      {:else if f.key === 'souscription'}<HandCoins size={18} />
                      {:else}<BookOpen size={18} />{/if}
                      {ajoute === f.key ? 'Ajouté au panier' : f.label} <span>({euros(f.price)})</span>
                    </button>
                  </form>
                {/each}
              <a href="/livre/{livre.slug}" class="inline-flex items-center border-2 border-foreground bg-foreground px-3.5 py-2 font-display text-sm font-bold uppercase tracking-wide text-background hover:border-link hover:bg-link">
                Voir le livre
              </a>
            </div>
            {#if ajoute}
              <a href="/panier" class="link mt-2 inline-block text-sm">Voir mon panier →</a>
            {/if}
            <p class="mt-4 text-xs text-muted-foreground">{(index ?? 0) + 1} / {livres.length} · ← → pour parcourir</p>
          </div>
        </div>
      {/key}
    </div>
    {@render fleche(1)}
    </div>
  </div>
{/if}

{#snippet fleche(delta: number)}
  {@const off = delta < 0 ? index === 0 : index === livres.length - 1}
  <button type="button" onclick={() => aller(delta)} disabled={off} aria-label={delta < 0 ? 'Livre précédent' : 'Livre suivant'}
    class="grid size-10 shrink-0 place-items-center bg-background text-foreground shadow-lg transition-colors hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:bg-background/40 disabled:text-foreground/30 disabled:shadow-none sm:size-12">
    {#if delta < 0}<CaretLeft size={22} weight="bold" />{:else}<CaretRight size={22} weight="bold" />{/if}
  </button>
{/snippet}
