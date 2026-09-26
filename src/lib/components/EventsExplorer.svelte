<script lang="ts">
  /**
   * Agenda dépliant de l'accueil — la carte et la liste se répondent.
   *
   * UN SEUL COMPOSANT PORTE LES DEUX, et c'est délibéré : l'état sélectionné est
   * partagé (ouvrir une fiche zoome la carte, cliquer un point déroule la liste
   * jusqu'à la fiche et l'ouvre, fermer la fiche redonne la vue d'ensemble). Le
   * découper en deux aurait imposé un magasin externe pour trois interactions.
   *
   * La carte n'est jamais la source de vérité : elle réagit à `selection`, elle
   * ne la fixe qu'en la déclarant. Une seule direction, pas de boucle.
   */
  import { onMount, onDestroy } from 'svelte';
  import { MapPin, Phone, Globe, X, CalendarBlank } from 'phosphor-svelte';
  import { ajouterFondDeCarteAuDefilement } from '$lib/client/map-tiles';

  interface Venue {
    name?: string; address?: string; city?: string; post_code?: string; country?: string;
    phone?: string; website?: string; description?: string; lat?: number; lng?: number;
  }
  interface Entry {
    slug: string; title: string; start_at?: string; end_at?: string;
    excerpt?: string; author_names: string[]; venue?: Venue;
  }

  let { events = [] }: { events?: Entry[] } = $props();

  /** Slug de la rencontre dépliée, ou null pour la vue d'ensemble. */
  let selection = $state<string | null>(null);
  let el: HTMLDivElement;
  let listeEl = $state<HTMLDivElement>();

  const situees = $derived(events.filter((e) => e.venue?.lat != null && e.venue?.lng != null));

  // ── Dates ────────────────────────────────────────────────────────────────
  const jour = (s?: string) => (s ? new Date(s).getDate() : '');
  const mois = (s?: string) =>
    s ? new Date(s).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '') : '';
  function periode(start?: string, end?: string): string {
    if (!start) return '';
    const d = new Date(start);
    const f = end ? new Date(end) : null;
    const plein: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    if (!f || d.toDateString() === f.toDateString()) return d.toLocaleDateString('fr-FR', plein);
    return `du ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} au ${f.toLocaleDateString('fr-FR', plein)}`;
  }
  const heure = (s?: string) => {
    if (!s) return '';
    const d = new Date(s);
    return d.getHours() || d.getMinutes() ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
  };
  /**
   * `address` est déjà l'adresse complète formatée par le géocodeur : la
   * recomposer à partir des morceaux la doublerait (« …11110 Armissan, France,
   * 11110 Armissan, France »). On ne recompose que faute d'`address`.
   */
  const adresse = (v?: Venue) =>
    v?.address?.trim()
      ? v.address.trim()
      : [v?.name, [v?.post_code, v?.city].filter(Boolean).join(' '), v?.country].filter(Boolean).join(', ');
  const hote = (u?: string) => {
    if (!u) return '';
    try { return new URL(u.startsWith('http') ? u : `https://${u}`).host.replace(/^www\./, ''); }
    catch { return u; }
  };
  const lienSite = (u?: string) => (!u ? '' : u.startsWith('http') ? u : `https://${u}`);

  // ── Carte ────────────────────────────────────────────────────────────────
  /** Zoom à l'ouverture d'une fiche : assez près pour situer, assez loin pour
   *  garder le quartier et les voies d'accès autour du lieu. */
  const ZOOM_FICHE = 13;
  let L: any = null;
  let map: any = null;
  const reperes = new Map<string, any>();

  /** Vue d'ensemble : tous les points, ou la France à défaut. */
  function vueEnsemble(animer = true) {
    if (!map || !L) return;
    const pts = situees.map((e) => [e.venue!.lat!, e.venue!.lng!] as [number, number]);
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.18), { animate: animer });
    else if (pts.length === 1) map.setView(pts[0], 11, { animate: animer });
    else map.setView([46.6, 2.4], 5, { animate: animer });
  }

  function ouvrir(slug: string, depuisCarte = false) {
    selection = slug;
    const e = events.find((x) => x.slug === slug);
    if (e?.venue?.lat != null && e.venue?.lng != null && map) {
      map.flyTo([e.venue.lat, e.venue.lng], ZOOM_FICHE, { duration: 0.8 });
    }
    // Depuis la carte : la fiche peut être hors du champ défilé, on l'y amène.
    if (depuisCarte) {
      requestAnimationFrame(() => {
        listeEl?.querySelector(`[data-slug="${CSS.escape(slug)}"]`)
          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }
  }

  function fermer() {
    selection = null;
    vueEnsemble();
  }

  // Les repères suivent la sélection (couleur pleine / atténuée).
  $effect(() => {
    const actif = selection;
    for (const [slug, m] of reperes) {
      const noeud = m.getElement?.() as HTMLElement | undefined;
      if (noeud) noeud.classList.toggle('is-actif', actif === slug);
      if (actif === slug) m.setZIndexOffset?.(1000);
      else m.setZIndexOffset?.(0);
    }
  });

  onMount(() => {
    let annule = false;
    (async () => {
      L = (await import('leaflet')).default;
      if (annule) return;
      map = L.map(el, { scrollWheelZoom: false, attributionControl: true, zoomControl: true })
        .setView([46.6, 2.4], 5); // France par défaut
      await ajouterFondDeCarteAuDefilement(L, map, el, { maxZoom: 19 });
      if (annule) return;

      const icone = L.divIcon({
        className: 'ag-pin',
        html: '<span class="ag-pin-point"></span>',
        iconSize: [20, 20],
        iconAnchor: [10, 20]
      });
      for (const e of situees) {
        const m = L.marker([e.venue!.lat!, e.venue!.lng!], { icon: icone, title: e.title })
          .addTo(map)
          .on('click', () => ouvrir(e.slug, true));
        reperes.set(e.slug, m);
      }
      // Le cadrage initial ne doit PAS écraser une fiche déjà ouverte : le fond se
      // pose en différé (à l'entrée dans le champ), un clic peut le précéder.
      if (!selection) vueEnsemble(false);
      else ouvrir(selection);
    })();
    return () => { annule = true; };
  });

  onDestroy(() => { try { map?.remove(); } catch { /* carte déjà retirée */ } });
</script>

<div class="grid gap-y-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" style="column-gap: var(--page-gutter)">
  <!-- Carte -->
  <div id="carte" class="order-2 scroll-mt-24 lg:order-1">
    <div bind:this={el} class="ag-map-gray h-[320px] w-full rounded-lg border border-border sm:h-[420px] lg:h-[620px]"></div>
  </div>

  <!-- Liste défilante -->
  <div class="order-1 lg:order-2">
    <div
      bind:this={listeEl}
      class="divide-y divide-border border-t border-border lg:max-h-[620px] lg:overflow-y-auto"
    >
      {#each events as e (e.slug)}
        {@const ouverte = selection === e.slug}
        <div data-slug={e.slug} class="relative scroll-mt-2 {ouverte ? 'bg-muted/40' : ''}">
          {#if ouverte}
            <button
              type="button"
              onclick={fermer}
              class="absolute right-2 top-3 z-10 grid size-8 place-items-center rounded-full border border-border bg-background text-foreground shadow-sm transition-colors hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
              aria-label="Fermer la fiche"
            >
              <X size={16} weight="bold" />
            </button>
          {/if}
          <button
            type="button"
            onclick={() => (ouverte ? fermer() : ouvrir(e.slug))}
            class="flex w-full items-baseline gap-4 py-4 pl-2 pr-12 text-left hover:bg-muted/30"
            aria-expanded={ouverte}
          >
            <span class="flex w-12 shrink-0 flex-col font-display leading-none">
              <span class="text-3xl font-bold">{jour(e.start_at)}</span>
              <span class="mt-1 text-xs uppercase text-muted-foreground">{mois(e.start_at)}</span>
            </span>
            <span class="min-w-0 flex-1">
              <span class="block font-display text-lg font-medium leading-tight">{e.title}</span>
              {#if e.venue?.name}
                <span class="mt-1 block text-xs text-muted-foreground">
                  <MapPin size={12} class="mb-0.5 mr-0.5 inline" />{e.venue.name}{e.venue.city ? `, ${e.venue.city}` : ''}
                </span>
              {/if}
            </span>
          </button>

          {#if ouverte}
            <div class="px-2 pb-5 pl-[4.25rem] text-sm">
              <p class="flex items-center gap-1.5 font-medium">
                <CalendarBlank size={14} class="text-muted-foreground" />
                <span class="first-letter:uppercase">{periode(e.start_at, e.end_at)}</span>
                {#if heure(e.start_at)}<span class="text-muted-foreground">· {heure(e.start_at)}</span>{/if}
              </p>

              {#if e.author_names.length}
                <p class="mt-1 text-muted-foreground">Avec {e.author_names.join(', ')}</p>
              {/if}

              {#if adresse(e.venue)}
                <p class="mt-3 flex items-start gap-1.5">
                  <MapPin size={14} class="mt-0.5 shrink-0 text-muted-foreground" />
                  <span>{adresse(e.venue)}</span>
                </p>
              {/if}

              {#if e.venue?.phone}
                <p class="mt-1 flex items-center gap-1.5">
                  <Phone size={14} class="shrink-0 text-muted-foreground" />
                  <a href="tel:{e.venue.phone.replace(/\s+/g, '')}" class="hover:text-link">{e.venue.phone}</a>
                </p>
              {/if}

              {#if e.venue?.website}
                <p class="mt-1 flex items-center gap-1.5">
                  <Globe size={14} class="shrink-0 text-muted-foreground" />
                  <a href={lienSite(e.venue.website)} target="_blank" rel="noopener" class="hover:text-link">{hote(e.venue.website)}</a>
                </p>
              {/if}

              {#if e.venue?.description}
                <p class="mt-3 text-muted-foreground">{e.venue.description}</p>
              {/if}

              {#if e.excerpt}
                <p class="mt-3 leading-relaxed text-foreground/80">{e.excerpt}</p>
              {/if}

              <a
                href="/rencontres/{e.slug}"
                class="link mt-3 inline-flex items-center gap-1.5 font-display text-sm font-semibold uppercase tracking-wide"
              >
                La rencontre <span aria-hidden="true">→</span>
              </a>
            </div>
          {/if}
        </div>
      {/each}

      {#if !events.length}
        <p class="px-2 py-6 text-sm text-muted-foreground">Aucune rencontre à venir pour le moment.</p>
      {/if}
    </div>
  </div>
</div>

<style>
  /* Repère : pastille rouge de marque, agrandie et cerclée quand elle est active. */
  :global(.ag-pin .ag-pin-point) {
    display: block;
    width: 18px;
    height: 18px;
    border-radius: 50% 50% 50% 0;
    background: #d4211c;
    border: 2px solid #fff;
    box-shadow: 0 1px 5px rgb(0 0 0 / 0.4);
    transform: rotate(-45deg);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  :global(.ag-pin.is-actif .ag-pin-point) {
    transform: rotate(-45deg) scale(1.45);
    box-shadow: 0 0 0 4px rgb(212 33 28 / 0.25), 0 2px 8px rgb(0 0 0 / 0.45);
  }
  :global(.ag-pin) { cursor: pointer; }
</style>
