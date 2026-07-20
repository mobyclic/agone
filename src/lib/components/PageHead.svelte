<script lang="ts">
  let {
    eyebrow,
    title,
    subtitle,
    meta,
    width = 'max-w-7xl',
    inner = '',
    children
  }: {
    eyebrow?: string; title: string; subtitle?: string; meta?: string;
    width?: string; inner?: string; children?: import('svelte').Snippet;
  } = $props();

  // Mini-bande collante : réapparaît au scroll une fois le gros header dépassé.
  let heroEl = $state<HTMLElement>();
  let stuck = $state(false);
  $effect(() => {
    if (!heroEl) return;
    const io = new IntersectionObserver(
      ([e]) => { stuck = !e.isIntersecting; },
      { rootMargin: '-65px 0px 0px 0px', threshold: 0 } // 65px ≈ hauteur de la nav collante
    );
    io.observe(heroEl);
    return () => io.disconnect();
  });
</script>

<section bind:this={heroEl} class="bg-background text-foreground">
  <div class="mx-auto {width} px-4 py-10 sm:px-6 sm:py-14">
    <div class={inner}>
      {#if eyebrow}
        <p class="font-display text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</p>
      {/if}
      <h1 class="display-title mt-2 text-4xl leading-[0.9] sm:text-6xl">{title}</h1>
      {#if subtitle}<p class="mt-5 max-w-2xl text-lg leading-snug text-muted-foreground sm:text-xl">{subtitle}</p>{/if}
      {#if meta}<p class="mt-4 text-sm text-muted-foreground/70">{meta}</p>{/if}
      {@render children?.()}
    </div>
  </div>
</section>

<!-- Bande de rappel : glisse depuis sous la nav quand on a dépassé le header.
     Noire (même encre que la barre du haut) pour prolonger la nav au scroll. -->
<div
  class="fixed inset-x-0 top-16 z-40 border-b border-white/10 bg-foreground text-background transition-[transform,opacity] duration-200 {stuck
    ? 'translate-y-0 opacity-100'
    : 'pointer-events-none -translate-y-full opacity-0'}"
>
  <div class="mx-auto flex {width} items-center gap-2 px-4 py-2.5 sm:px-6">
    {#if eyebrow}
      <span class="shrink-0 font-display text-xs font-semibold uppercase tracking-[0.14em] text-background/55">{eyebrow}</span>
      <span class="shrink-0 text-background/30">·</span>
    {/if}
    <span class="truncate font-display text-sm font-bold uppercase tracking-wide">{title}</span>
  </div>
</div>
