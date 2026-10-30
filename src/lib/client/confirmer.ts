import type { SubmitFunction } from '@sveltejs/kit';

/**
 * Confirmation avant l'envoi d'un formulaire amélioré : `use:enhance={confirmer('Supprimer ?')}`.
 *
 * NE PAS écrire `use:enhance onsubmit={(e) => { if (!confirm(…)) e.preventDefault(); }}` :
 * `enhance` envoie le formulaire sans regarder `defaultPrevented`, donc « Annuler » n'annulait
 * rien (suppressions, remboursement, envoi de la newsletter partaient quand même).
 * Ici, un refus appelle `cancel()` ; `suite` reprend le comportement d'`enhance` voulu ensuite.
 */
export function confirmer(message: string | (() => string), suite?: SubmitFunction): SubmitFunction {
  return (input) => {
    if (!confirm(typeof message === 'function' ? message() : message)) {
      input.cancel();
      return;
    }
    return suite?.(input);
  };
}
