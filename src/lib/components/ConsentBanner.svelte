<script lang="ts">
  import { onMount } from 'svelte';
  import {
    type ConsentState, DEFAULT_DENIED,
    readConsent, writeConsent, applyConsentToTags, makeAcceptAll, makeRejectAll
  } from '$lib/consent';

  let view = $state<'closed' | 'simple' | 'custom'>('closed');
  let analytics = $state(false);
  let marketing = $state(false);

  onMount(() => {
    const existing = readConsent();
    if (existing) {
      analytics = existing.analytics;
      marketing = existing.marketing;
      applyConsentToTags(existing); // rejoue la décision à chaque chargement
    } else {
      view = 'simple';
    }
    // Le lien « Gérer les cookies » (pied de page) rouvre le panneau détaillé.
    const open = () => {
      const c = readConsent() ?? DEFAULT_DENIED;
      analytics = c.analytics; marketing = c.marketing; view = 'custom';
    };
    window.addEventListener('open-consent-banner', open);
    return () => window.removeEventListener('open-consent-banner', open);
  });

  function logConsent(c: ConsentState, decision: 'accept_all' | 'reject_all' | 'custom') {
    try {
      fetch('/api/consent-log', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketing: c.marketing, analytics: c.analytics, decision }), keepalive: true
      }).catch(() => {});
    } catch { /* noop */ }
  }
  function persist(c: ConsentState, decision: 'accept_all' | 'reject_all' | 'custom') {
    writeConsent(c);
    applyConsentToTags(c);
    logConsent(c, decision);
    view = 'closed';
  }
  const acceptAll = () => { analytics = true; marketing = true; persist(makeAcceptAll(), 'accept_all'); };
  const rejectAll = () => { analytics = false; marketing = false; persist(makeRejectAll(), 'reject_all'); };
  const saveCustom = () => persist({ necessary: true, analytics, marketing, decided_at: new Date().toISOString() }, 'custom');

  const btn = 'px-4 py-2.5 border border-border text-sm hover:bg-muted transition-colors';
  const btnPrimary = 'px-4 py-2.5 bg-foreground text-background text-sm hover:bg-foreground/90 transition-colors';
</script>

{#if view !== 'closed'}
  <div class="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-background shadow-[0_-10px_40px_rgba(0,0,0,0.12)]" role="dialog" aria-modal="false" aria-labelledby="consent-title">
    <div class="mx-auto max-w-5xl px-4 py-5 sm:px-6">
      {#if view === 'simple'}
        <div class="flex flex-col gap-4 md:flex-row md:items-center">
          <div class="flex-1">
            <h2 id="consent-title" class="mb-1 font-display text-sm font-semibold uppercase tracking-wide">Cookies & confidentialité</h2>
            <p class="text-sm leading-snug text-muted-foreground">
              Nous utilisons des cookies pour mesurer l'audience et, avec votre accord, suivre nos campagnes publicitaires. Vous pouvez tout accepter, tout refuser ou choisir vos préférences.
              <a href="/mentions-legales" class="underline hover:text-foreground">En savoir plus</a>
            </p>
          </div>
          <div class="flex flex-wrap gap-2 md:shrink-0">
            <button type="button" onclick={() => (view = 'custom')} class={btn}>Personnaliser</button>
            <button type="button" onclick={rejectAll} class={btn}>Tout refuser</button>
            <button type="button" onclick={acceptAll} class={btnPrimary}>Tout accepter</button>
          </div>
        </div>
      {:else}
        <div class="space-y-4">
          <div>
            <h2 id="consent-title" class="font-display text-sm font-semibold uppercase tracking-wide">Préférences de cookies</h2>
            <p class="mt-1 text-xs text-muted-foreground">Vos choix sont conservés 1 an. Vous pouvez les modifier à tout moment depuis le pied de page.</p>
          </div>
          <div class="space-y-1 border-t border-border pt-3">
            <div class="flex items-start justify-between gap-4 py-2">
              <div class="flex-1">
                <p class="text-sm font-medium">Strictement nécessaires</p>
                <p class="text-xs text-muted-foreground">Panier, session, préférences. Toujours actifs.</p>
              </div>
              <span class="mt-0.5 text-xs text-muted-foreground">Toujours actif</span>
            </div>
            <label class="flex cursor-pointer items-start justify-between gap-4 border-t border-border/60 py-2">
              <div class="flex-1">
                <p class="text-sm font-medium">Mesure d'audience</p>
                <p class="text-xs text-muted-foreground">Statistiques anonymisées pour améliorer le site.</p>
              </div>
              <input type="checkbox" bind:checked={analytics} class="mt-1 size-4 accent-foreground" />
            </label>
            <label class="flex cursor-pointer items-start justify-between gap-4 border-t border-border/60 py-2">
              <div class="flex-1">
                <p class="text-sm font-medium">Publicité & marketing</p>
                <p class="text-xs text-muted-foreground">Suivi des conversions et reciblage (Meta / Instagram, Google Ads).</p>
              </div>
              <input type="checkbox" bind:checked={marketing} class="mt-1 size-4 accent-foreground" />
            </label>
          </div>
          <div class="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
            <button type="button" onclick={rejectAll} class={btn}>Tout refuser</button>
            <button type="button" onclick={saveCustom} class={btn}>Enregistrer mes choix</button>
            <button type="button" onclick={acceptAll} class={btnPrimary}>Tout accepter</button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
