<script lang="ts">
  /**
   * Fenêtre de confirmation du back-office : un titre, un contenu libre, Annuler / l'action.
   * Échap ou un clic hors de la fenêtre annulent. `onconfirm` reçoit la main une fois la
   * fenêtre refermée (typiquement : `form.requestSubmit()`).
   */
  import type { Snippet } from 'svelte';
  import { Button } from '$lib/components/ui/button';

  let {
    open = $bindable(false),
    titre,
    confirmer = 'Confirmer',
    danger = false,
    onconfirm,
    children
  }: { open?: boolean; titre: string; confirmer?: string; danger?: boolean; onconfirm: () => void; children?: Snippet } = $props();

  function valider() {
    open = false;
    onconfirm();
  }
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape') open = false; }} />

{#if open}
  <div class="fixed inset-0 z-[80] grid place-items-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="confirm-titre">
    <button type="button" class="absolute inset-0 cursor-default bg-black/60" aria-label="Annuler" onclick={() => (open = false)}></button>
    <div class="relative z-10 w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-2xl">
      <h3 id="confirm-titre" class="text-lg font-bold">{titre}</h3>
      <div class="mt-2 text-sm text-muted-foreground">{@render children?.()}</div>
      <div class="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onclick={() => (open = false)}>Annuler</Button>
        <!-- svelte-ignore a11y_autofocus -->
        <Button type="button" size="sm" autofocus onclick={valider} class={danger ? 'bg-destructive text-white hover:bg-destructive/90' : ''}>{confirmer}</Button>
      </div>
    </div>
  </div>
{/if}
