// Fond de carte commun à TOUTES les cartes Leaflet d'Agone — source unique.
// Porté depuis MovUP (apps/crm/src/lib/client/map-tiles.ts), lui-même issu de
// _legacy/public/_mup-fond.js (MUPFond) : Plan IGN vectoriel
// (Géoplateforme), rendu par MapLibre GL posé dans Leaflet par le pont
// @maplibre/maplibre-gl-leaflet — Leaflet reste le moteur, il garde la vue,
// les panes, les marqueurs et les bulles, seul le fond change.
//
// TOUTE SURFACE QUI PORTE UNE CARTE PASSE PAR ICI : accueil (rencontres),
// fiche lieu, sélecteur de position de l'admin. Le style, l'attribution, le plafond de
// zoom, les deux registres d'extinction, les trois transpositions vers le blanc
// (routes, surfaces d'eau, toponymes) et leurs facteurs vivent dans ce fichier
// et nulle part ailleurs. Une page qui veut s'écarter du réglage commun le
// demande par PARAMÈTRE D'APPEL (maxZoom, opacity, paleurRoutes) ; elle ne
// recopie rien — une recopie ferait diverger les réglages au premier changement.
//
// Écarts au module d'origine, assumés : les bibliothèques viennent des paquets
// npm (pas d'unpkg — l'app est bundlée) et la feuille maplibre-gl.css reste
// importée (déjà dans le bundle, elle éteint l'avertissement console « missing
// CSS declarations » ; le coût CDN qui la faisait exclure côté legacy n'existe
// pas ici). Repli conservé : si MapLibre ne se charge pas (WebGL absent,
// import en échec), le raster « Plan IGN v2 » de la Géoplateforme prend place.
import type * as Leaflet from 'leaflet';

type LeafletLib = typeof Leaflet;

// Le produit vectoriel s'appelle PLAN.IGN, sans « v2 » : le « v2 » était le nom
// de la couche WMTS raster (conservée en repli).
const STYLE_PLAN_IGN = 'https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/gris.json';

// LE SPRITE DU STYLE GRIS EST SERVI PAR NOUS, ET C'EST UNE RÉPARATION. Le style
// pointe sprite/PlanIgn-Gris, que la Géoplateforme ne sert QU'EN @1x : sur un
// écran haute densité, MapLibre demande PlanIgn-Gris@2x.json/.png, reçoit 404
// (relevé du 2 septembre 2026), journalise une AJAXError et rend les couches à
// icônes sans leurs images (« Localite », « Marais »…). Le sprite STANDARD
// (PlanIgn) existe bien en @2x mais ses motifs sont bleus et orangés : posés sur
// le fond gris, marais et estran ressortiraient en couleur.
//
// La copie locale (static/vendor/plan-ign) sert donc la planche GRISE sous les
// deux noms, @2x compris — et c'est EXACT, pas un à-peu-près : les 30 entrées du
// sprite déclarent chacune pixelRatio 1, que MapLibre lit par entrée ; l'écran
// dense affiche les mêmes icônes qu'un écran simple, au lieu de rien. Glyphes et
// tuiles restent chez l'IGN. Le jour où la Géoplateforme publie un vrai @2x,
// il suffit de rafraîchir la copie (ou de retirer la retouche de chargerStyle).
const SPRITE_LOCAL = '/vendor/plan-ign/PlanIgn-Gris';

// Le style, récupéré UNE fois par session et retouché : la clé `sprite` passe
// sur la copie locale. Échec de lecture → l'URL brute, c'est-à-dire le
// comportement d'avant la réparation (MapLibre récupère le style lui-même, et
// l'écran dense retombe sur ses 404 de sprite — dégradé, jamais bloquant).
let stylePromesse: Promise<string | Record<string, unknown>> | null = null;
function chargerStylePlanIgn(): Promise<string | Record<string, unknown>> {
  if (!stylePromesse) {
    stylePromesse = (async () => {
      try {
        const r = await fetch(STYLE_PLAN_IGN);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const style = await r.json();
        style.sprite = location.origin + SPRITE_LOCAL;
        return style;
      } catch (e: any) {
        console.warn('[carte] style Plan IGN illisible, sprite non réparé :', e?.message ?? e);
        stylePromesse = null;   // un échec transitoire ne fige pas la session
        return STYLE_PLAN_IGN;
      }
    })();
  }
  return stylePromesse;
}

// OpenStreetMap reste cité : il sert de socle hors de France (voir SOCLE_MONDIAL).
const ATTRIBUTION_PLAN_IGN = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  + ' &middot; Plan IGN &middot; &copy; IGN / G&eacute;oplateforme';

// 19, ET C'EST MESURÉ, PAS SUPPOSÉ. Le pont cale MapLibre sur getZoom() - 1
// (tuiles vectorielles de 512 px contre 256 px chez Leaflet) et la source
// PLAN.IGN annonce maxzoom 18 dans sa metadata.json : le dernier niveau de
// tuiles réellement servi tombe donc au zoom Leaflet 19. Au-delà, MapLibre
// agrandit la géométrie du z18 (net, mais sans détail de plus). C'est la borne
// de la source : une page qui annonçait davantage annonçait du vide.
const PLAFOND_ZOOM = 19;

// ── SOCLE MONDIAL, PROPRE À AGONE ─────────────────────────────────────────
// ÉCART ASSUMÉ AVEC MOVUP, et il vient des données : le Plan IGN s'arrête aux
// frontières (relevé du 9 septembre 2026 : tuile vectorielle 404 sur Bruxelles
// dès le zoom 14), or 9 de nos rencontres se tiennent en Belgique et 2 en
// Suisse. MovUP n'a jamais eu ce cas — ses tournées sont françaises.
// Le style PLAN.IGN ne déclare AUCUN calque `background` : là où la source n'a
// pas de donnée, le canevas GL reste transparent. Une couche OSM posée DESSOUS
// transparaît donc exactement dans ces trous, et nulle part ailleurs.
const SOCLE_MONDIAL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

export type FournisseurFond = 'plan-ign' | 'ign' | 'osmfr';
export const FOND_PAR_DEFAUT: FournisseurFond = 'plan-ign';

const RASTERS: Record<Exclude<FournisseurFond, 'plan-ign'>, { url: string; attribution: string; subdomains?: string; maxZoom: number }> = {
  ign: {
    url: 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    attribution: '&copy; <a href="https://www.ign.fr/" target="_blank" rel="noopener">IGN</a> &ndash; Géoplateforme',
    maxZoom: 19
  },
  osmfr: {
    url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> France',
    subdomains: 'abc',
    maxZoom: 20
  }
};

// ── COUCHES ÉTEINTES PAR SOURCE-LAYER ─────────────────────────────────────
// Premier des deux registres d'extinction : celui-ci porte les couches dont le
// source-layer ne contient rien qu'on veuille garder, et se coupe donc à cette
// maille. C'est la forme préférable : le style compte 425 couches, leurs
// identifiants sont des libellés en clair et changeront, le nom de la couche
// source ne bouge pas.
const COUCHES_ETEINTES = ['routier_chemin', 'routier_chemin_sup', 'routier_chemin_sou',
  'oro_relief', 'oro_courbe', 'oro_lin', 'oro_ponc',
  'ocs_vegetation_surf', 'ocs_nature_sol_surf'];

// ── COUCHES ÉTEINTES PAR IDENTIFIANT ──────────────────────────────────────
// Second registre : les source-layers qui mélangent ce qu'on veut éteindre et ce
// qu'on veut garder (une coupe à leur maille emporterait tout d'un bloc).
// « limite_lin » porte 18 couches : en partent les limites administratives, les
// limites d'état, clôtures, layons, enceintes militaires, contours de parcs —
// 17 traits qui découpent le fond sans rien dire d'une tournée. Reste allumée
// « limite cote », le liseré terre/mer des zooms 7 à 10. Les 5 toponymes de
// limites nomment tous un contour éteint : ils partent avec lui.
// CE REGISTRE EST FRAGILE, et on le sait en l'écrivant : un identifiant de style
// est un libellé en clair, que l'IGN peut renommer sans prévenir. Le prix s'en
// paie au relevé : tout identifiant orphelin est compté et signalé en console.
const COUCHES_ETEINTES_PAR_ID = [
  'limite admin - limite de commune',
  'limite admin - limite de département bandeau',
  'limite admin - limite de département tiret',
  'limite admin - limite de région bandeau',
  'limite admin - limite de région tiret',
  'limite etat 1', 'limite etat 2',
  'Limite - cloture', 'Limite - layon',
  'Zone Règlementee - Enceinte militaire',
  'limite zone naturelle',
  'limite zone naturelle - Parc naturel 10',
  'limite zone naturelle - Parc naturel 11',
  'limite zone naturelle - Parc naturel 12',
  'limite zone naturelle - Parc naturel 13',
  'limite zone naturelle - Parc naturel 14',
  'limite zone naturelle - Parc marin',
  'toponyme - limite parc ponc 1 et 2',
  'toponyme - limite parc ponc 3 et 4',
  'toponyme - limite parc marin',
  'toponyme - limite militaire ponc 1 et 2',
  'toponyme - limite militaire ponc 3 et 4'];

// ── ROUTES ATTÉNUÉES ──────────────────────────────────────────────────────
// Le style gris dessine ses routes en gris soutenu (#B4B4B4, #878787…), qui
// rivalise avec les points de fiches et le tracé de tournée : transposition vers
// le blanc, canal par canal, sans jamais toucher l'alpha. PALEUR_ROUTES : 0
// laisse la couleur d'origine, 1 rend du blanc pur — un seul chiffre pour toutes
// les cartes du produit à la fois.
const PALEUR_ROUTES = 0.6;
const COUCHES_ROUTIERES = ['routier_route', 'routier_route_sup', 'routier_route_sou',
  'routier_liaison', 'routier_surf'];

// ── SURFACES D'EAU ATTÉNUÉES ──────────────────────────────────────────────
// Mer, estran et étendues d'eau en aplats gris soutenus : sur une côte découpée,
// une baie occupe la moitié du cadre. Même mécanique que les routes. Le
// périmètre se prend par source-layer et « hydro_surf » SE PREND EN ENTIER :
// l'étiquette « symbo » change avec le zoom (ZONE_MARINE, SURFACE_D_EAU,
// BASSIN), un filtre dessus laisserait à pleine force ce qu'elle ne nomme pas.
// L'estran y est, et il le faut : laissé soutenu pendant que la mer s'éclaircit,
// il ferait tout au long du littoral un liseré inverse du geste.
const PALEUR_SURFACES_EAU = 0.2;
const COUCHES_SURFACES_EAU = ['hydro_surf'];

// ── CONTOUR DE L'HYDRO SURFACIQUE ─────────────────────────────────────────
// Sans fill-outline-color, MapLibre trace le bord du polygone dans la couleur de
// l'aplat pâli ; or « limite cote » (LIM_COTE) s'arrête au zoom 11 et le trait
// de côte s'éteindrait d'un coup. On désolidarise donc le contour de l'aplat sur
// la seule couche « hydro surfacique ». LA VALEUR S'ÉCRIT BRUTE, avant la passe
// de pâlissement qui la relit comme les autres : #8C8C8C rend #A3A3A3 au facteur
// 0.2, à trois points du #A0A0A0 de « limite cote » — relais à densité égale.
// Lacs et bassins reçoivent le même contour dès le zoom 8 : un plan d'eau cerné
// ne coûte rien à la lecture d'une tournée ; un littoral qui se dissout, si.
const COUCHE_HYDRO_SURF = 'hydro surfacique';
const CONTOUR_HYDRO_SURF = '#8C8C8C';

// ── TOPONYMES ATTÉNUÉS ────────────────────────────────────────────────────
// Les noms en noir franc tiennent tête aux points de fiches sur un fond dont
// routes et eaux viennent de reculer. Le périmètre se prend AU PRÉFIXE du
// source-layer : les 15 source-layers de texte commencent tous par « toponyme »
// et aucun autre — pas de liste à tenir à jour. Le halo entre dans le périmètre
// (103 des 106 halos sont déjà blancs et le restent) ; seuls les cartouches de
// nationale et d'autoroute pâlissent des deux côtés, prix accepté.
const PALEUR_TOPONYMES = 0.5;
const PREFIXE_TOPONYME = 'toponyme';

// ── TRAIT DE CÔTE PAR LA LAISSE DE HAUTE MER ──────────────────────────────
// La source livre « hydro_laisse » dans ses tuiles, et le style gris ne porte
// aucune couche dessus : c'est la SEULE couche que ce module AJOUTE — partout
// ailleurs il n'éteint, ne pâlit ou ne repeint que de l'existant. « limite
// cote » s'éteint au zoom 11 ; le contour de l'eau cerne un polygone de marée
// qui court au large de la côte partout où l'estran découvre ; la laisse de
// haute mer, elle, suit ce qu'un habitant appelle la côte (12 à 108 m en médiane
// sur les trois sites de contrôle). LE SYMBO CHANGE D'ORTHOGRAPHE AVEC LE
// NIVEAU, et le filtre prend les deux : pluriel au niveau généralisé n10 (seul
// servi au zoom 13), singulier au niveau détaillé n0 (zooms 14 à 18) — la même
// couche continue de peindre au passage de 13 à 14, sans clignotement.
// « LAISSE_BASSES_MERS » reste dehors : elle doublerait le trait à la largeur de
// l'estran. Au niveau n10 la basse mer passe quand même sous le symbo de la
// haute (39 à 54 % du linéaire au zoom 13, aucun filtre ne les sépare) : limite
// de la source acceptée, le n0 reprend au zoom 14. La donnée s'arrête au zoom
// 18 ; le 19 se vise sur une adresse, pas sur une côte. LA COULEUR S'ÉCRIT À SA
// VALEUR FINALE (posée APRÈS les trois passes, qu'aucune ne relit) : #A0A0A0,
// exactement le gris de « limite cote », largeur 1.
const SOURCE_LAYER_LAISSE = 'hydro_laisse';
const COUCHE_LAISSE = 'mup - trait de cote';
const SYMBO_LAISSE_HAUTE = ['LAISSES_HAUTES_MERS', 'LAISSE_HAUTES_MERS'];
const COULEUR_LAISSE = '#A0A0A0';
const LARGEUR_LAISSE = 1;

export interface OptionsFond {
  /** Socle OSM sous le vectoriel, visible seulement hors couverture IGN (défaut : true). */
  socleMondial?: boolean;
  fournisseur?: FournisseurFond;
  /** Opacité du fond (les pages d'origine posaient 0.85 / 0.92 sur certaines cartes). */
  opacity?: number;
  /** Plafond de zoom demandé par la page — borné à 19, la borne de la source PLAN.IGN. */
  maxZoom?: number;
  /** Pâleur des routes (0 = couleur d'origine, 1 = blanc pur) ; défaut PALEUR_ROUTES. */
  paleurRoutes?: number;
}

// ── PÂLISSEMENT ───────────────────────────────────────────────────────────
// Deux formes de valeur circulent dans ce style : la chaîne simple ('#RRGGBB' ou
// 'rgba(…)') et la fonction de zoom héritée ({stops:[[zoom, couleur], …]}).
// palirCouleur ne connaît que la chaîne et rend null sur ce qu'elle ne sait pas
// lire, pour que l'appelant COMPTE ces cas plutôt que de les taire.
function palirCouleur(couleur: unknown, facteur: number): string | null {
  if (typeof couleur !== 'string') return null;
  const versBlanc = (canal: number) => Math.round(canal + (255 - canal) * facteur);
  const hexa = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(couleur);
  if (hexa) {
    return '#' + [1, 2, 3].map((rang) =>
      ('0' + versBlanc(parseInt(hexa[rang], 16)).toString(16)).slice(-2)
    ).join('').toUpperCase();
  }
  const rgb = /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?\)$/i.exec(couleur);
  if (rgb) {
    const canaux = [1, 2, 3].map((rang) => versBlanc(parseFloat(rgb[rang]))).join(', ');
    // L'alpha repart tel quel, jamais recalculé.
    return rgb[4] === undefined ? 'rgb(' + canaux + ')' : 'rgba(' + canaux + ', ' + rgb[4] + ')';
  }
  return null;
}

interface Releve { chaines: number; rampes: number; intactes: number }

// LA TRANSPOSITION EST LA MÊME POUR LES TROIS PÉRIMÈTRES : routes, surfaces
// d'eau et toponymes ne diffèrent que par la couche retenue et par le facteur.
function palirCouches(glMap: any, facteur: number, estConcernee: (couche: any) => boolean): Releve {
  const releve: Releve = { chaines: 0, rampes: 0, intactes: 0 };
  glMap.getStyle().layers.forEach((couche: any) => {
    if (!estConcernee(couche)) return;
    const peinture = couche.paint || {};
    Object.keys(peinture).forEach((propriete) => {
      if (propriete.indexOf('color') < 0) return;
      const valeur = peinture[propriete];
      if (typeof valeur === 'string') {
        const pale = palirCouleur(valeur, facteur);
        if (pale === null) { releve.intactes++; return; }
        glMap.setPaintProperty(couche.id, propriete, pale);
        releve.chaines++;
        return;
      }
      if (valeur && typeof valeur === 'object' && Array.isArray(valeur.stops)) {
        // On recopie la rampe au lieu de la muter : l'objet rendu par getStyle()
        // est celui que MapLibre garde, le modifier sur place brouillerait la
        // comparaison faite par setPaintProperty.
        let complete = true;
        const paliers = valeur.stops.map((palier: [number, unknown]) => {
          const pale = palirCouleur(palier[1], facteur);
          if (pale === null) complete = false;
          return [palier[0], pale === null ? palier[1] : pale];
        });
        if (!complete) { releve.intactes++; return; }
        const rampe: Record<string, unknown> = { stops: paliers };
        if ('base' in valeur) rampe.base = valeur.base;
        glMap.setPaintProperty(couche.id, propriete, rampe);
        releve.rampes++;
        return;
      }
      // Expression moderne en tableau ou forme inconnue : laissée telle quelle,
      // mais comptée, pour qu'un silence ne passe pas pour un traitement.
      releve.intactes++;
    });
  });
  return releve;
}

// Un silence ne doit pas passer pour un traitement : ce qui n'a pas été relu se
// dit, périmètre par périmètre, avec son dénominateur.
function signalerReleve(famille: string, releve: Releve) {
  if (!releve.intactes) return;
  console.warn('Plan IGN : ' + releve.intactes + ' propriété(s) de couleur ' + famille
    + ' laissée(s) intacte(s) sur ' + (releve.chaines + releve.rampes + releve.intactes)
    + ', forme de valeur non reconnue.');
}

// ── POSE DU TRAIT DE CÔTE ─────────────────────────────────────────────────
// Aucun identifiant IGN en clair ne sert d'ancrage : source et rang se
// retrouvent par leur source-layer, la forme que ce fichier préfère partout.

// La source des tuiles se lit sur l'eau : le trait de côte doit venir des mêmes
// tuiles que le polygone qu'il borde.
function trouverSourceEau(glMap: any): string | null {
  for (const couche of glMap.getStyle().layers) {
    if (COUCHES_SURFACES_EAU.indexOf(couche['source-layer']) >= 0) return couche.source;
  }
  return null;
}

// LE RANG SE PREND SOUS LE PREMIER TOPONYME : au-dessus de tous les aplats (eau
// pâlie comprise), des routes, du ferré et du bâti, et sous tous les noms.
function trouverAncreToponyme(glMap: any): string | null {
  for (const couche of glMap.getStyle().layers) {
    const source = couche['source-layer'];
    if (typeof source === 'string' && source.indexOf(PREFIXE_TOPONYME) === 0) return couche.id;
  }
  return null;
}

// TROIS REPLIS, ET AUCUNE POSE SILENCIEUSEMENT RATÉE : ce que l'IGN peut
// renommer se vérifie avant d'écrire, et se dit en console quand il manque.
function poserTraitDeCote(glMap: any) {
  const source = trouverSourceEau(glMap);
  if (!source) {
    console.warn('Plan IGN : aucune couche en « ' + COUCHES_SURFACES_EAU.join(', ')
      + ' » dans le style, source des tuiles introuvable, trait de côte non posé.');
    return;
  }

  // vectorLayerIds vient de la metadata.json de la source, déjà chargée quand
  // « load » se déclenche. Absente ou vide, on pose quand même : une couche
  // branchée sur une source-layer inexistante ne dessine rien et ne casse rien —
  // mieux qu'un faux négatif qui priverait le littoral de son trait sur un doute.
  const sourceGL = glMap.getSource(source);
  const couchesSource = sourceGL && sourceGL.vectorLayerIds;
  if (Array.isArray(couchesSource) && couchesSource.length
    && couchesSource.indexOf(SOURCE_LAYER_LAISSE) < 0) {
    console.warn('Plan IGN : source-layer « ' + SOURCE_LAYER_LAISSE + ' » absente des tuiles, '
      + 'trait de côte non posé, source-layer renommée côté IGN.');
    return;
  }

  // Sans ancre, la couche part au sommet de la pile, donc par-dessus les noms :
  // mal rangée mais visible, et signalée. Un trait de côte absent coûterait
  // davantage à la lecture qu'un trait de côte trop haut.
  const ancre = trouverAncreToponyme(glMap);
  if (!ancre) {
    console.warn('Plan IGN : aucune couche de toponyme dans le style, trait de côte posé au sommet '
      + 'de la pile, donc par-dessus les noms.');
  }

  // Filtre à l'ancienne forme, celle qu'emploient les 425 couches du style.
  const couche = {
    id: COUCHE_LAISSE,
    type: 'line',
    source: source,
    'source-layer': SOURCE_LAYER_LAISSE,
    filter: ['in', 'symbo', ...SYMBO_LAISSE_HAUTE],
    // La géométrie de la laisse est très dentelée : un raccord en onglet y
    // produit des pointes, le raccord rond n'en produit pas.
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': COULEUR_LAISSE, 'line-width': LARGEUR_LAISSE }
  };
  if (ancre) glMap.addLayer(couche, ancre); else glMap.addLayer(couche);
}

// ── RÉGLAGES DU STYLE, sur l'événement load (avant lui, getStyle() est vide) ──
function appliquerReglages(glMap: any, paleurRoutes: number) {
  glMap.getStyle().layers.forEach((couche: any) => {
    if (COUCHES_ETEINTES.indexOf(couche['source-layer']) < 0) return;
    glMap.setLayoutProperty(couche.id, 'visibility', 'none');
  });

  // Extinction par identifiant. getLayer rend undefined sur un nom que le style
  // ne porte pas : c'est là qu'un renommage IGN se détecte, et on le compte au
  // lieu de laisser setLayoutProperty lever.
  let identifiantsOrphelins = 0;
  COUCHES_ETEINTES_PAR_ID.forEach((identifiant) => {
    if (!glMap.getLayer(identifiant)) { identifiantsOrphelins++; return; }
    glMap.setLayoutProperty(identifiant, 'visibility', 'none');
  });
  if (identifiantsOrphelins) {
    console.warn('Plan IGN : ' + identifiantsOrphelins + ' identifiant(s) de couche à éteindre sur '
      + COUCHES_ETEINTES_PAR_ID.length + ' sans correspondance dans le style, libellé(s) renommé(s) côté IGN.');
  }

  signalerReleve('routière', palirCouches(glMap, paleurRoutes, (couche) =>
    COUCHES_ROUTIERES.indexOf(couche['source-layer']) >= 0));
  // LE CONTOUR SE POSE AVANT LA PASSE, et c'est tout le montage : palirCouches
  // relit le style, il y trouvera cette propriété et la traitera avec les autres
  // couleurs du périmètre. Posée après, elle resterait brute.
  if (glMap.getLayer(COUCHE_HYDRO_SURF)) {
    glMap.setPaintProperty(COUCHE_HYDRO_SURF, 'fill-outline-color', CONTOUR_HYDRO_SURF);
  } else {
    console.warn('Plan IGN : couche « ' + COUCHE_HYDRO_SURF + ' » absente du style, '
      + 'contour de l\'eau non posé, libellé renommé côté IGN.');
  }
  signalerReleve("de surface d'eau", palirCouches(glMap, PALEUR_SURFACES_EAU, (couche) =>
    COUCHES_SURFACES_EAU.indexOf(couche['source-layer']) >= 0));
  signalerReleve('de toponyme', palirCouches(glMap, PALEUR_TOPONYMES, (couche) => {
    const source = couche['source-layer'];
    return typeof source === 'string' && source.indexOf(PREFIXE_TOPONYME) === 0;
  }));

  // EN DERNIER, ET C'EST VOULU : posée après les trois passes, la couche n'est
  // relue par aucune d'elles et sa couleur reste celle qui est écrite.
  poserTraitDeCote(glMap);
}

// ── CHARGEMENT DES BIBLIOTHÈQUES (npm, une promesse pour la vie de la page) ──
let chargement: Promise<boolean> | null = null;

/** Précharge MapLibre GL et le pont Leaflet (idempotent). Rend false si indisponible. */
export function prechargerFond(): Promise<boolean> {
  if (!chargement) {
    chargement = (async () => {
      try {
        await import('maplibre-gl/dist/maplibre-gl.css');
        // MapLibre (ESM) localise son worker par `new URL('maplibre-gl-worker.mjs', import.meta.url)` :
        // sous Vite (pré-bundle en dev, hachage en build) cette URL relative ne pointe plus sur rien.
        // On laisse Vite empaqueter le worker (`?worker&url`) et on impose son adresse.
        const [{ setWorkerUrl }, { default: workerUrl }] = await Promise.all([
          import('maplibre-gl'),
          import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url')
        ]);
        setWorkerUrl(workerUrl);
        await import('@maplibre/maplibre-gl-leaflet');
        return true;
      } catch (e: any) {
        console.warn('[carte] MapLibre indisponible, repli sur le raster IGN :', e?.message ?? e);
        return false;
      }
    })();
  }
  return chargement;
}

// Une carte Leaflet détruite (map.remove()) perd son volet principal : on ne pose rien dessus.
function carteVivante(map: Leaflet.Map): boolean {
  try { return Boolean((map as any)._mapPane) && map.getContainer().isConnected; } catch { return false; }
}

function poserRaster(L: LeafletLib, map: Leaflet.Map, fournisseur: Exclude<FournisseurFond, 'plan-ign'>, opts: OptionsFond): Leaflet.TileLayer {
  const r = RASTERS[fournisseur];
  const couche = L.tileLayer(r.url, {
    attribution: r.attribution,
    maxZoom: Math.min(opts.maxZoom ?? r.maxZoom, r.maxZoom),
    opacity: opts.opacity ?? 1,
    ...(r.subdomains ? { subdomains: r.subdomains } : {})
  });
  couche.addTo(map);
  return couche;
}

/**
 * Cœur de la pose. Rend une promesse résolue quand le fond est PEINT : style
 * vectoriel chargé ET réglages appliqués, ou repli raster posé, ou plus rien à
 * faire (carte détruite). Jamais de rejet : un appelant qui met en scène quelque
 * chose par-dessus (la démonstration de l'accueil) s'y accroche sans garde.
 * Le PLAFOND DE ZOOM SE POSE SUR LA CARTE, TOUT DE SUITE : le pont étend L.Layer
 * (pas GridLayer), aucun maxZoom de couche ne serait lu, et sans borne finie
 * L.markerClusterGroup lève « Map has no maxZoom specified » — une page qui pose
 * des points regroupés perdrait ses points faute de fond.
 */
async function poserFond(L: LeafletLib, map: Leaflet.Map, opts: OptionsFond = {}): Promise<void> {
  const fournisseur = opts.fournisseur ?? FOND_PAR_DEFAUT;
  if (fournisseur !== 'plan-ign') { poserRaster(L, map, fournisseur, opts); return; }
  map.setMaxZoom(Math.min(opts.maxZoom ?? PLAFOND_ZOOM, PLAFOND_ZOOM));
  // Socle posé AVANT le vectoriel : il occupe le volet du dessous et ne se voit
  // que dans les trous de couverture du Plan IGN.
  if (opts.socleMondial !== false) {
    L.tileLayer(SOCLE_MONDIAL, {
      maxZoom: Math.min(opts.maxZoom ?? PLAFOND_ZOOM, PLAFOND_ZOOM),
      subdomains: 'abc',
      attribution: ''
    }).addTo(map);
  }
  // Le style et MapLibre se chargent DE FRONT : le style (280 Ko) ne retarde pas
  // la bibliothèque, et réciproquement.
  const [ok, style] = await Promise.all([prechargerFond(), chargerStylePlanIgn()]);
  if (!carteVivante(map)) return;
  if (ok) {
    try {
      // L'ATTRIBUTION PASSE PAR attributionControl.customAttribution, pas par
      // l'option attribution : le pont redéfinit getAttribution() pour lire
      // cette clé, et à défaut le champ attribution des sources du style — que
      // le style IGN ne porte pas. L'objet ne fuit pas vers MapLibre (le pont
      // force attributionControl:false côté GL).
      const couche = (L as any).maplibreGL({
        style,
        attributionControl: { customAttribution: ATTRIBUTION_PLAN_IGN }
      });
      couche.addTo(map);
      const conteneur: HTMLElement | undefined = couche.getContainer?.();
      if (conteneur && opts.opacity !== undefined && opts.opacity < 1) conteneur.style.opacity = String(opts.opacity);
      const glMap = couche.getMaplibreMap();
      await new Promise<void>((resoudre) => {
        glMap.on('load', () => {
          const paleur = typeof opts.paleurRoutes === 'number' ? opts.paleurRoutes : PALEUR_ROUTES;
          try { appliquerReglages(glMap, paleur); }
          catch (e: any) { console.warn('[carte] réglages du Plan IGN en échec (fond laissé brut) :', e?.message ?? e); }
          resoudre();
        });
        // Une carte détruite avant le style chargé ne peindra jamais : la promesse
        // se résout au retrait, pour ne pas retenir un appelant accroché.
        map.once('unload', () => resoudre());
      });
      return;
    } catch (e: any) {
      console.warn('[carte] fond vectoriel en échec, repli sur le raster IGN :', e?.message ?? e);
      // La couche a pu être attachée avant de lever : on nettoie ce qui a été posé.
      map.eachLayer((l) => { if ((l as any).getMaplibreMap) map.removeLayer(l); });
    }
  }
  if (carteVivante(map)) poserRaster(L, map, 'ign', opts);
}

/**
 * Pose le fond de carte sur `map`. Synchrone pour l'appelant : le fond vectoriel
 * est ajouté dès que MapLibre est chargé ; en cas d'échec, le raster IGN prend la
 * place. L'appelant qui a besoin de SAVOIR quand le fond est peint passe par
 * ajouterFondDeCarteAuDefilement (ou attend la promesse qu'elle rend).
 */
export function ajouterFondDeCarte(L: LeafletLib, map: Leaflet.Map, opts: OptionsFond = {}): void {
  void poserFond(L, map, opts);
}

/**
 * POSE DIFFÉRÉE, À L'ENTRÉE DANS LE CHAMP DE L'ÉCRAN — pour l'accueil public
 * seul : MapLibre pèse ~275 ko gzip et la carte de démonstration n'est jamais
 * visible sans défilement ; un visiteur qui ne descend pas ne télécharge rien.
 * MILLE PIXELS D'AVANCE, ET NON DEUX CENTS : le montage du fond se mesure
 * au-delà de deux secondes cache froid, et un seuil court faisait arriver le
 * visiteur sur un cadre blanc. Celui qui s'arrête à moins de mille pixels de la
 * carte paiera le chargement sans la voir — compromis retenu.
 * La promesse rendue est celle de poserFond : elle ne se résout qu'une fois le
 * fond peint. C'est à elle que la mise en scène de la démonstration s'accroche,
 * pour que les points ne se posent jamais sur un cadre vide. Repli sans
 * observateur (navigateur ancien) : pose immédiate, jamais de carte sans fond.
 */
export function ajouterFondDeCarteAuDefilement(L: LeafletLib, map: Leaflet.Map, element: Element | null, opts: OptionsFond = {}): Promise<void> {
  return new Promise((resoudre) => {
    const allumer = () => { poserFond(L, map, opts).then(resoudre, () => resoudre()); };
    if (!element || typeof IntersectionObserver === 'undefined') { allumer(); return; }
    const observateur = new IntersectionObserver((entrees) => {
      for (const e of entrees) {
        if (!e.isIntersecting) continue;
        observateur.disconnect();
        allumer();
        return;
      }
    }, { rootMargin: '1000px' });
    observateur.observe(element);
  });
}
