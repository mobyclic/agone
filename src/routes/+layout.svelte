<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import PublicHeader from '$lib/components/PublicHeader.svelte';
  import PublicFooter from '$lib/components/PublicFooter.svelte';
  import { Toaster } from 'svelte-sonner';
  import { consumeUrlFlash } from '$lib/toasts';

  let { data, children } = $props();

  // Les espaces /admin et /compte ont leur propre shell (sidebar) → pas de header/footer public.
  const standalone = $derived(
    page.url.pathname.startsWith('/admin') || page.url.pathname.startsWith('/compte')
  );

  $effect(() => {
    consumeUrlFlash(page.url);
  });
</script>

{#if standalone}
  {@render children?.()}
{:else}
  <div class="flex min-h-svh flex-col">
    <PublicHeader user={data.user} cartCount={data.cartCount ?? 0} nav={data.nav} />
    <main class="flex-1">
      {@render children?.()}
    </main>
    <PublicFooter />
  </div>
{/if}

<Toaster
  richColors
  closeButton
  position="top-right"
  toastOptions={{
    classes: {
      toast: 'border border-border bg-card text-card-foreground shadow-md',
      title: 'font-medium',
      description: 'text-muted-foreground text-xs'
    }
  }}
/>
