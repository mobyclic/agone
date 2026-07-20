<script lang="ts">
  import Wordmark from './Wordmark.svelte';
  import { enhance } from '$app/forms';
  import { FacebookLogo, InstagramLogo, LinkedinLogo, Butterfly, MastodonLogo } from 'phosphor-svelte';

  const year = 2026;
  let subscribed = $state(false);

  const socials = [
    { name: 'Facebook', icon: FacebookLogo, href: 'https://www.facebook.com/editions.agone' },
    { name: 'Instagram', icon: InstagramLogo, href: 'https://www.instagram.com/editions_agone/' },
    { name: 'LinkedIn', icon: LinkedinLogo, href: 'https://www.linkedin.com/company/editions-agone/' },
    { name: 'Bluesky', icon: Butterfly, href: 'https://bsky.app/profile/agone.org' },
    { name: 'Mastodon', icon: MastodonLogo, href: 'https://piaille.fr/@agone' }
  ];
</script>

<footer class="border-t border-border bg-secondary/40">
  <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
    <div class="grid gap-10 lg:grid-cols-5">
      <div class="lg:col-span-2">
        <a href="/" class="inline-flex text-foreground" aria-label="Agone — accueil"><Wordmark /></a>
        <p class="mt-4 max-w-xs text-sm text-muted-foreground">
          Agone — éditeur engagé. Sciences sociales, histoire, littérature et critique du présent.
        </p>
        <div class="mt-5 flex items-center gap-1">
          {#each socials as s (s.name)}
            <a href={s.href} target="_blank" rel="noopener" aria-label={s.name} class="grid size-9 place-items-center text-muted-foreground hover:text-foreground">
              <s.icon size={20} />
            </a>
          {/each}
        </div>
      </div>

      <div>
        <div class="eyebrow mb-3">Découvrir</div>
        <ul class="space-y-2 text-sm">
          <li><a class="text-muted-foreground hover:text-foreground" href="/catalogue">Catalogue</a></li>
          <li><a class="text-muted-foreground hover:text-foreground" href="/auteurs">Auteurs</a></li>
          <li><a class="text-muted-foreground hover:text-foreground" href="/rencontres">Rencontres</a></li>
          <li><a class="text-muted-foreground hover:text-foreground" href="/antichambre">L’Antichambre</a></li>
        </ul>
      </div>

      <div>
        <div class="eyebrow mb-3">La maison</div>
        <ul class="space-y-2 text-sm">
          <li><a class="text-muted-foreground hover:text-foreground" href="/a-propos">À propos</a></li>
          <li><a class="text-muted-foreground hover:text-foreground" href="/a-paraitre">À paraître</a></li>
          <li><a class="text-muted-foreground hover:text-foreground" href="/contact">Contact</a></li>
        </ul>
      </div>

      <div>
        <div class="eyebrow mb-3">Lettre d’information</div>
        <p class="mb-3 text-sm text-muted-foreground">Nouveautés, rencontres et textes de L’Antichambre.</p>
        {#if subscribed}
          <p class="text-sm text-success">Merci, votre inscription est prise en compte.</p>
        {:else}
          <form
            method="POST"
            action="/newsletter"
            use:enhance={() => async ({ result, update }) => {
              if (result.type === 'success') subscribed = true;
              else update();
            }}
            class="flex gap-2"
          >
            <input
              name="email"
              type="email"
              required
              placeholder="Votre email"
              class="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <button type="submit" class="btn-brand h-9 rounded-md px-3 text-sm font-medium">S’abonner</button>
          </form>
        {/if}
      </div>
    </div>

    <div class="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
      <p>© {year} Agone éditeur — Marseille. Tous droits réservés.</p>
      <div class="flex gap-4">
        <a class="hover:text-foreground" href="/mentions-legales">Mentions légales</a>
        <a class="hover:text-foreground" href="/cgv">CGV</a>
        <button type="button" class="hover:text-foreground" onclick={() => window.dispatchEvent(new CustomEvent('open-consent-banner'))}>Gérer les cookies</button>
      </div>
    </div>
  </div>
</footer>
