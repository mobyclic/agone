<script lang="ts">
  /**
   * Partager une page (livre, article, rencontre) — discret : un petit lien
   * « Partager » qui ouvre le partage natif du téléphone quand il existe, sinon
   * un menu sobre : copier le lien, e-mail, et quelques réseaux.
   */
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import { ShareNetwork, LinkSimple, EnvelopeSimple, Check } from 'phosphor-svelte';
  let { title, text = '', class: klass = '' }: { title: string; text?: string; class?: string } = $props();
  let ouvert = $state(false);
  let copie = $state(false);
  const url = $derived(page.url.href.split('#')[0]);
  const enc = encodeURIComponent;
  const reseaux = $derived([
    { nom: 'Bluesky', href: `https://bsky.app/intent/compose?text=${enc(`${title} ${url}`)}` },
    { nom: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
    { nom: 'X', href: `https://x.com/intent/post?text=${enc(title)}&url=${enc(url)}` },
    { nom: 'Mastodon', href: `https://mastodonshare.com/?text=${enc(`${title} ${url}`)}` },
    { nom: 'WhatsApp', href: `https://wa.me/?text=${enc(`${title} ${url}`)}` }
  ]);
  async function partager() {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try { await navigator.share({ title, text: text || title, url }); return; } catch { /* annulé : on ouvre le menu */ }
    }
    ouvert = !ouvert;
  }
  async function copier() {
    try { await navigator.clipboard.writeText(url); copie = true; toast.success('Lien copié.'); setTimeout(() => (copie = false), 2000); } catch { toast.error('Copie impossible.'); }
  }
</script>

<svelte:window onclick={(e) => { if (ouvert && !(e.target as HTMLElement).closest('[data-partager]')) ouvert = false; }} onkeydown={(e) => { if (e.key === 'Escape') ouvert = false; }} />

<span class="relative inline-block {klass}" data-partager>
  <button type="button" onclick={partager} aria-expanded={ouvert} class="inline-flex items-center gap-1 font-display text-xs uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground">
    <ShareNetwork size={13} /> Partager
  </button>
  {#if ouvert}
    <div class="absolute left-0 top-full z-20 mt-1.5 min-w-44 border border-border bg-background py-1 text-sm shadow-lg" role="menu">
      <button type="button" onclick={copier} role="menuitem" class="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted">{#if copie}<Check size={14} class="text-success" />{:else}<LinkSimple size={14} />{/if} Copier le lien</button>
      <a href="mailto:?subject={enc(title)}&body={enc(`${title}\n${url}`)}" role="menuitem" class="flex items-center gap-2 px-3 py-1.5 hover:bg-muted" onclick={() => (ouvert = false)}><EnvelopeSimple size={14} /> E-mail</a>
      <div class="my-1 border-t border-border"></div>
      {#each reseaux as r (r.nom)}
        <a href={r.href} target="_blank" rel="noopener" role="menuitem" class="block px-3 py-1.5 hover:bg-muted" onclick={() => (ouvert = false)}>{r.nom}</a>
      {/each}
    </div>
  {/if}
</span>
