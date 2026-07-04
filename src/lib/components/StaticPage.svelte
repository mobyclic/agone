<script lang="ts">
  let { title, html, children }: { title: string; html?: string; children?: import('svelte').Snippet } = $props();
</script>

<div class="mx-auto max-w-3xl px-4 py-12 sm:px-6">
  <h1 class="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
  {#if html}
    <div class="prose-agone mt-8 max-w-none text-[16px] leading-relaxed [&_a]:text-link [&_a:hover]:underline [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:font-bold [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-4 [&_ul]:my-4">
      {@html html}
    </div>
  {/if}
  {@render children?.()}
</div>
