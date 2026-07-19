<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import PublicHeader from '$lib/components/PublicHeader.svelte';
  import PublicFooter from '$lib/components/PublicFooter.svelte';
  import ConsentBanner from '$lib/components/ConsentBanner.svelte';
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

<svelte:head>
  {#if data.tracking?.gtm_id || data.tracking?.ga_id || data.tracking?.meta_pixel_id}
    <!-- Google Consent Mode v2 : refus par défaut, mis à jour par la CMP -->
    {@html `<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',functionality_storage:'granted',security_storage:'granted',wait_for_update:500});
</script>`}
  {/if}
  {#if data.tracking?.gtm_id}
    <!-- Google Tag Manager (configurer GA4 + Meta Pixel dans GTM) -->
    {@html `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${data.tracking.gtm_id}');</script>`}
  {:else}
    {#if data.tracking?.ga_id}
      <script async src="https://www.googletagmanager.com/gtag/js?id={data.tracking.ga_id}"></script>
      {@html `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${data.tracking.ga_id}');</script>`}
    {/if}
    {#if data.tracking?.meta_pixel_id}
      {@html `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('consent','revoke');fbq('init','${data.tracking.meta_pixel_id}');fbq('track','PageView');</script>`}
    {/if}
  {/if}
</svelte:head>

{#if standalone}
  {@render children?.()}
{:else}
  <div class="flex min-h-svh flex-col">
    <PublicHeader user={data.user} cartCount={data.cartCount ?? 0} nav={data.nav} />
    <main class="flex-1 border-t-[5px] border-t-white">
      {@render children?.()}
    </main>
    <PublicFooter />
  </div>
  {#if data.tracking?.gtm_id}
    <noscript><iframe src="https://www.googletagmanager.com/ns.html?id={data.tracking.gtm_id}" height="0" width="0" style="display:none;visibility:hidden" title="Google Tag Manager"></iframe></noscript>
  {/if}
  <ConsentBanner />
{/if}

<Toaster
  position="top-center"
  closeButton
  toastOptions={{
    classes: {
      toast:
        'flex w-full items-center gap-3 rounded-lg border border-border border-l-[5px] border-l-foreground bg-card px-4 py-3.5 text-card-foreground shadow-xl',
      title: 'font-display text-sm font-semibold uppercase tracking-wide',
      description: 'text-xs text-muted-foreground',
      success: '!border-l-success',
      error: '!border-l-destructive',
      warning: '!border-l-warning',
      info: '!border-l-link',
      closeButton: 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
    }
  }}
/>
