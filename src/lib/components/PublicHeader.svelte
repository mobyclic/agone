<script lang="ts">
  import { page } from '$app/state';
  import {
    List, X, MagnifyingGlass, ShoppingCart, CaretDown,
    FacebookLogo, InstagramLogo, LinkedinLogo, Butterfly, MastodonLogo
  } from 'phosphor-svelte';

  interface NavData { collections: { name: string; slug: string }[]; rubriques: { name: string; slug: string }[] }
  let { user, cartCount = 0, nav }: { user: App.Locals['user']; cartCount?: number; nav?: NavData } = $props();

  let open = $state(false);
  const isActive = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(href + '/');
  const collections = $derived(nav?.collections ?? []);
  const rubriques = $derived(nav?.rubriques ?? []);

  // Réseaux sociaux — à confirmer / ajuster (URLs réelles Agone).
  const socials = [
    { name: 'Facebook', icon: FacebookLogo, href: 'https://www.facebook.com/editions.agone' },
    { name: 'Instagram', icon: InstagramLogo, href: 'https://www.instagram.com/editions_agone/' },
    { name: 'LinkedIn', icon: LinkedinLogo, href: 'https://www.linkedin.com/company/editions-agone/' },
    { name: 'Bluesky', icon: Butterfly, href: 'https://bsky.app/profile/agone.org' },
    { name: 'Mastodon', icon: MastodonLogo, href: 'https://piaille.fr/@agone' }
  ];
</script>

<header class="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
  <div class="flex h-16 items-center gap-3 pr-3 sm:pr-5">
    <!-- Logo : barre noire depuis le bord gauche jusqu'au logo -->
    <a href="/" class="flex h-full shrink-0 items-center gap-3" aria-label="Agone — accueil">
      <span class="h-6 w-12 shrink-0 bg-foreground sm:h-7 sm:w-20 lg:w-28"></span>
      <span class="font-serif text-xl font-bold uppercase leading-none tracking-tight text-foreground">
        <span class="italic text-[1.4em]">A</span>GON<span class="text-[1.4em]">E</span>
      </span>
    </a>

    <!-- Navigation principale -->
    <nav class="ml-2 hidden items-center xl:flex">
      <!-- Antichambre ▾ -->
      <div class="group/drop relative">
        <a href="/antichambre" class="inline-flex items-center gap-1 px-2.5 py-2 font-display text-xl font-medium uppercase tracking-wide">
          <span class="text-link transition-opacity {isActive('/antichambre') || isActive('/article') ? 'opacity-100' : 'opacity-0 group-hover/drop:opacity-100'}">[</span>Antichambre<span class="text-link transition-opacity {isActive('/antichambre') || isActive('/article') ? 'opacity-100' : 'opacity-0 group-hover/drop:opacity-100'}">]</span>
          <CaretDown size={12} class="text-muted-foreground" />
        </a>
        {#if rubriques.length}
          <div class="invisible absolute left-0 top-full z-50 -translate-y-1 pt-1 opacity-0 transition-all duration-150 group-hover/drop:visible group-hover/drop:translate-y-0 group-hover/drop:opacity-100">
            <div class="min-w-[280px] bg-popover py-2 text-popover-foreground shadow-2xl">
              {#each rubriques as r (r.slug)}
                <a href="/antichambre?rubrique={r.slug}" class="block px-4 py-1.5 font-display text-[15px] tracking-wide text-popover-foreground/70 hover:bg-white/5 hover:text-white">{r.name}</a>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- Catalogue ▾ -->
      <div class="group/drop relative">
        <a href="/catalogue" class="inline-flex items-center gap-1 px-2.5 py-2 font-display text-xl font-medium uppercase tracking-wide">
          <span class="text-link transition-opacity {isActive('/catalogue') || isActive('/livre') || isActive('/collections') ? 'opacity-100' : 'opacity-0 group-hover/drop:opacity-100'}">[</span>Catalogue<span class="text-link transition-opacity {isActive('/catalogue') || isActive('/livre') || isActive('/collections') ? 'opacity-100' : 'opacity-0 group-hover/drop:opacity-100'}">]</span>
          <CaretDown size={12} class="text-muted-foreground" />
        </a>
        {#if collections.length}
          <div class="invisible absolute left-0 top-full z-50 -translate-y-1 pt-1 opacity-0 transition-all duration-150 group-hover/drop:visible group-hover/drop:translate-y-0 group-hover/drop:opacity-100">
            <div class="min-w-[280px] bg-popover py-2 text-popover-foreground shadow-2xl">
              {#each collections as c (c.slug)}
                <a href="/collections/{c.slug}" class="block px-4 py-1.5 font-display text-[15px] tracking-wide text-popover-foreground/70 hover:bg-white/5 hover:text-white">{c.name}</a>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <a href="/auteurs" class="group/n inline-flex items-center px-2.5 py-2 font-display text-xl font-medium uppercase tracking-wide">
        <span class="text-link transition-opacity {isActive('/auteurs') || isActive('/auteur') ? 'opacity-100' : 'opacity-0 group-hover/n:opacity-100'}">[</span>Auteurs<span class="text-link transition-opacity {isActive('/auteurs') || isActive('/auteur') ? 'opacity-100' : 'opacity-0 group-hover/n:opacity-100'}">]</span>
      </a>
      <a href="/rencontres" class="group/n inline-flex items-center px-2.5 py-2 font-display text-xl font-medium uppercase tracking-wide">
        <span class="text-link transition-opacity {isActive('/rencontres') ? 'opacity-100' : 'opacity-0 group-hover/n:opacity-100'}">[</span>Rencontres<span class="text-link transition-opacity {isActive('/rencontres') ? 'opacity-100' : 'opacity-0 group-hover/n:opacity-100'}">]</span>
      </a>
      <a href="/a-propos" class="group/n inline-flex items-center px-2.5 py-2 font-display text-xl font-medium uppercase tracking-wide">
        <span class="text-link transition-opacity {isActive('/a-propos') ? 'opacity-100' : 'opacity-0 group-hover/n:opacity-100'}">[</span>La maison<span class="text-link transition-opacity {isActive('/a-propos') ? 'opacity-100' : 'opacity-0 group-hover/n:opacity-100'}">]</span>
      </a>
    </nav>

    <!-- Droite : recherche, panier, compte, réseaux -->
    <div class="ml-auto flex items-center gap-1">
      <a href="/recherche" class="grid size-9 place-items-center text-muted-foreground hover:text-foreground" aria-label="Rechercher"><MagnifyingGlass size={20} /></a>
      <a href="/panier" class="relative grid size-9 place-items-center text-muted-foreground hover:text-foreground" aria-label="Panier">
        <ShoppingCart size={20} />
        {#if cartCount > 0}<span class="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{cartCount}</span>{/if}
      </a>

      <a href={user ? '/compte' : '/connexion'} class="btn-brand ml-1 hidden h-9 items-center px-3.5 font-display text-sm font-medium uppercase tracking-wide sm:inline-flex">Mon compte</a>

      <div class="ml-2 hidden items-center gap-0.5 border-l border-border pl-2.5 lg:flex">
        {#each socials as s (s.name)}
          <a href={s.href} target="_blank" rel="noopener" aria-label={s.name} class="grid size-8 place-items-center text-muted-foreground hover:text-foreground">
            <s.icon size={18} />
          </a>
        {/each}
      </div>

      <button class="grid size-9 place-items-center hover:bg-muted xl:hidden" onclick={() => (open = !open)} aria-label="Menu">
        {#if open}<X size={22} />{:else}<List size={22} />{/if}
      </button>
    </div>
  </div>

  {#if open}
    <div class="border-t border-border bg-background xl:hidden">
      <nav class="px-4 py-3 font-display uppercase tracking-wide sm:px-6">
        <a href="/antichambre" onclick={() => (open = false)} class="block py-2 font-medium">Antichambre</a>
        {#each rubriques as r (r.slug)}<a href="/antichambre?rubrique={r.slug}" onclick={() => (open = false)} class="block py-1 pl-4 text-sm text-muted-foreground">{r.name}</a>{/each}
        <a href="/catalogue" onclick={() => (open = false)} class="mt-2 block py-2 font-medium">Catalogue</a>
        {#each collections as c (c.slug)}<a href="/collections/{c.slug}" onclick={() => (open = false)} class="block py-1 pl-4 text-sm text-muted-foreground">{c.name}</a>{/each}
        <a href="/auteurs" onclick={() => (open = false)} class="mt-2 block py-2 font-medium">Auteurs</a>
        <a href="/rencontres" onclick={() => (open = false)} class="block py-2 font-medium">Rencontres</a>
        <a href="/a-propos" onclick={() => (open = false)} class="block py-2 font-medium">La maison</a>
        <a href={user ? '/compte' : '/connexion'} onclick={() => (open = false)} class="mt-2 block border-t border-border py-2 pt-3 font-medium text-link">Mon compte</a>
        <div class="mt-3 flex items-center gap-3 border-t border-border pt-3">
          {#each socials as s (s.name)}
            <a href={s.href} target="_blank" rel="noopener" aria-label={s.name} class="text-muted-foreground hover:text-foreground"><s.icon size={20} /></a>
          {/each}
        </div>
      </nav>
    </div>
  {/if}
</header>
