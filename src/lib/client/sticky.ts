/**
 * Colonne de droite « ferrée en bas » au défilement.
 *
 * Une colonne collée en HAUT (`sticky top-…`) plus haute que l'écran a son bas
 * inatteignable tant que le contenu principal n'est pas fini de défiler. Ici :
 * - colonne plus courte que l'écran → elle se colle en haut, sous l'en-tête ;
 * - colonne plus haute → elle défile avec la page jusqu'à ce que son BAS
 *   atteigne le bas de l'écran, puis elle y reste ferrée.
 *
 * Technique : `position: sticky` avec un `top` égal à (hauteur d'écran −
 * hauteur de la colonne − marge), donc négatif pour une colonne haute. Le parent
 * de grille doit porter `items-start`, sinon la colonne est étirée et ne colle pas.
 * Recalculé quand la colonne change de taille (images chargées, contenu déplié).
 */
export function colonneCollante(node: HTMLElement, opts: { haut?: number; bas?: number } = {}) {
  const haut = opts.haut ?? 128; // en-tête collant + bande de rappel du titre
  const bas = opts.bas ?? 24;
  const large = window.matchMedia('(min-width: 1024px)');

  function poser() {
    if (!large.matches) {
      node.style.removeProperty('position');
      node.style.removeProperty('top');
      return;
    }
    const h = node.offsetHeight;
    const top = h + haut + bas <= window.innerHeight ? haut : window.innerHeight - h - bas;
    node.style.position = 'sticky';
    node.style.top = `${Math.round(top)}px`;
  }

  poser();
  const ro = new ResizeObserver(poser);
  ro.observe(node);
  window.addEventListener('resize', poser);
  large.addEventListener('change', poser);
  return {
    destroy() {
      ro.disconnect();
      window.removeEventListener('resize', poser);
      large.removeEventListener('change', poser);
    }
  };
}
