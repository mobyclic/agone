<script lang="ts">
  let {
    eyebrow,
    title,
    subtitle,
    meta,
    width = 'max-w-7xl'
  }: { eyebrow?: string; title: string; subtitle?: string; meta?: string; width?: string } = $props();

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

<section bind:this={heroEl} class="bg-ink text-white">
  <div class="mx-auto {width} px-4 py-14 sm:px-6 sm:py-20">
    {#if eyebrow}
      <p class="font-display text-sm font-semibold uppercase tracking-[0.16em] text-white/55">{eyebrow}</p>
    {/if}
    <h1 class="display-title mt-2 text-5xl leading-[0.9] sm:text-7xl">{title}</h1>
    {#if subtitle}<p class="mt-5 max-w-2xl text-lg leading-snug text-white/70 sm:text-xl">{subtitle}</p>{/if}
    {#if meta}<p class="mt-4 text-sm text-white/45">{meta}</p>{/if}
  </div>
</section>

<!-- Bande de rappel : glisse depuis sous la nav quand on a dépassé le header. -->
<div
  class="fixed inset-x-0 top-16 z-40 border-b border-white/10 bg-ink text-white transition-[transform,opacity] duration-200 {stuck
    ? 'translate-y-0 opacity-100'
    : 'pointer-events-none -translate-y-full opacity-0'}"
>
  <div class="mx-auto flex {width} items-center gap-2 px-4 py-2.5 sm:px-6">
    {#if eyebrow}
      <span class="shrink-0 font-display text-xs font-semibold uppercase tracking-[0.14em] text-white/55">{eyebrow}</span>
      <span class="shrink-0 text-white/30">·</span>
    {/if}
    <span class="truncate font-display text-sm font-bold uppercase tracking-wide">{title}</span>
  </div>
</div>
