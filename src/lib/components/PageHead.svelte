<script lang="ts">
  let {
    eyebrow,
    title,
    subtitle,
    meta
  }: { eyebrow?: string; title: string; subtitle?: string; meta?: string } = $props();
</script>

<section class="bg-ink text-white">
  <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
    {#if eyebrow}
      <p class="font-display text-sm font-semibold uppercase tracking-[0.16em] text-white/55">{eyebrow}</p>
    {/if}
    <h1 class="display-title mt-2 text-5xl leading-[0.9] sm:text-7xl">{title}</h1>
    {#if subtitle}<p class="mt-5 max-w-2xl text-lg leading-snug text-white/70 sm:text-xl">{subtitle}</p>{/if}
    {#if meta}<p class="mt-4 text-sm text-white/45">{meta}</p>{/if}
  </div>
</section>
