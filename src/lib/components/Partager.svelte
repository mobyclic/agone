<script lang="ts">
  /**
   * Partager une page (livre, article, rencontre) : une rangée discrète d'icônes,
   * un réseau par bouton (copier le lien, e-mail, Bluesky, Facebook, X, LinkedIn,
   * Mastodon, WhatsApp), et le partage natif du téléphone quand il existe.
   */
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import { LinkSimple, EnvelopeSimple, Butterfly, FacebookLogo, XLogo, LinkedinLogo, MastodonLogo, WhatsappLogo, ShareNetwork, Check } from 'phosphor-svelte';

  let { title, text = '', class: klass = '' }: { title: string; text?: string; class?: string } = $props();

  const url = $derived(page.url.href.split('#')[0]);
  const enc = encodeURIComponent;
  const reseaux = $derived([
    { nom: 'Bluesky', icone: Butterfly, href: `https://bsky.app/intent/compose?text=${enc(`${title} ${url}`)}` },
    { nom: 'Facebook', icone: FacebookLogo, href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
    { nom: 'X', icone: XLogo, href: `https://x.com/intent/post?text=${enc(title)}&url=${enc(url)}` },
    { nom: 'LinkedIn', icone: LinkedinLogo, href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}` },
    { nom: 'Mastodon', icone: MastodonLogo, href: `https://mastodonshare.com/?text=${enc(title)}&url=${enc(url)}` },
    { nom: 'WhatsApp', icone: WhatsappLogo, href: `https://wa.me/?text=${enc(`${title} ${url}`)}` }
  ]);

  let natif = $state(false);
  let copie = $state(false);
  onMount(() => { natif = typeof navigator !== 'undefined' && 'share' in navigator; });

  async function copier() {
    try {
      await navigator.clipboard.writeText(url);
      copie = true; toast.success('Lien copié.');
      setTimeout(() => (copie = false), 2000);
    } catch { toast.error('Copie impossible.'); }
  }
  async function partagerNatif() {
    try { await navigator.share({ title, text: text || title, url }); } catch { /* annulé */ }
  }
  const bouton = 'grid size-8 place-items-center border border-border text-muted-foreground transition-colors hover:border-foreground hover:bg-foreground hover:text-background';
</script>

<div class="flex flex-wrap items-center gap-1.5 {klass}" role="group" aria-label="Partager">
  <span class="mr-1 font-display text-xs uppercase tracking-wide text-muted-foreground">Partager</span>
  {#if natif}
    <button type="button" onclick={partagerNatif} class={bouton} title="Partager…" aria-label="Partager avec une application"><ShareNetwork size={15} /></button>
  {/if}
  <button type="button" onclick={copier} class={bouton} title="Copier le lien" aria-label="Copier le lien">{#if copie}<Check size={15} />{:else}<LinkSimple size={15} />{/if}</button>
  <a href="mailto:?subject={enc(title)}&body={enc(`${title}\n${url}`)}" class={bouton} title="Envoyer par e-mail" aria-label="Envoyer par e-mail"><EnvelopeSimple size={15} /></a>
  {#each reseaux as r (r.nom)}
    <a href={r.href} target="_blank" rel="noopener" class={bouton} title="Partager sur {r.nom}" aria-label="Partager sur {r.nom}"><r.icone size={15} /></a>
  {/each}
</div>
