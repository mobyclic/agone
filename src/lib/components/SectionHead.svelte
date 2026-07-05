<script lang="ts">
  let { title, href, more }: { title: string; href?: string; more?: string } = $props();
</script>

<div class="mb-7 flex items-end justify-between gap-4 border-b-[3px] border-foreground pb-2.5">
  <h2 class="display-title text-2xl leading-none sm:text-3xl">{title}</h2>
  {#if href && more}
    <a {href} class="link shrink-0 whitespace-nowrap pb-1 font-display text-sm font-medium uppercase tracking-wide">{more} →</a>
  {/if}
</div>
