<script lang="ts">
  import { X, CaretLeft, CaretRight } from 'phosphor-svelte';

  let {
    images = [],
    open = $bindable(false),
    index = $bindable(0),
    alt = ''
  }: { images?: string[]; open?: boolean; index?: number; alt?: string } = $props();

  const prev = () => (index = (index - 1 + images.length) % images.length);
  const next = () => (index = (index + 1) % images.length);
  function onKey(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') open = false;
    else if (e.key === 'ArrowLeft') prev();
    else if (e.key === 'ArrowRight') next();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if open && images.length}
  <div class="fixed inset-0 z-[60] bg-black/90">
    <button type="button" class="absolute inset-0 cursor-default" aria-label="Fermer l'aperçu" onclick={() => (open = false)}></button>
    <div class="pointer-events-none relative z-10 flex h-full flex-col p-4 sm:p-8">
      <div class="pointer-events-auto flex justify-end">
        <button type="button" onclick={() => (open = false)} class="grid size-10 place-items-center text-white/80 hover:text-white" aria-label="Fermer"><X size={26} /></button>
      </div>
      <div class="flex min-h-0 flex-1 items-center justify-center gap-3 sm:gap-5">
        {#if images.length > 1}<button type="button" onclick={prev} class="pointer-events-auto grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Précédent"><CaretLeft size={22} /></button>{/if}
        <img src={images[index]} alt={alt} class="pointer-events-auto max-h-full max-w-full object-contain" />
        {#if images.length > 1}<button type="button" onclick={next} class="pointer-events-auto grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Suivant"><CaretRight size={22} /></button>{/if}
      </div>
      {#if images.length > 1}
        <div class="pointer-events-auto mt-4 flex justify-center gap-2 overflow-x-auto pb-1">
          {#each images as img, i (i)}
            <button type="button" onclick={() => (index = i)} class="h-16 w-12 shrink-0 overflow-hidden border-2 {i === index ? 'border-white' : 'border-transparent opacity-50 hover:opacity-100'}">
              <img src={img} alt="" class="size-full object-cover" />
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}
