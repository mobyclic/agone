<script lang="ts">
  import PageHead from './PageHead.svelte';
  let {
    title,
    html,
    eyebrow = 'Éditions Agone',
    children
  }: { title: string; html?: string; eyebrow?: string; children?: import('svelte').Snippet } = $props();
</script>

<PageHead {eyebrow} {title} width="max-w-3xl" />

<div class="mx-auto max-w-3xl px-4 py-12 sm:px-6">
  {#if html}
    <div class="prose-agone max-w-none text-[16px] leading-relaxed [&_a]:text-link [&_a:hover]:underline [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:font-bold [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-4 [&_ul]:my-4">
      {@html html}
    </div>
  {/if}
  {@render children?.()}
</div>
