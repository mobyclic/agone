<script lang="ts">
  import { page } from '$app/state';
  import Logo from './Logo.svelte';
  import UserMenu from './UserMenu.svelte';
  import { Button } from '$lib/components/ui/button';
  import { List, X, MagnifyingGlass, ShoppingCart, CaretDown } from 'phosphor-svelte';

  interface NavData { collections: { name: string; slug: string }[]; rubriques: { name: string; slug: string }[] }
  let { user, cartCount = 0, nav }: { user: App.Locals['user']; cartCount?: number; nav?: NavData } = $props();

  let open = $state(false);
  const isActive = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(href + '/');
  const collections = $derived(nav?.collections ?? []);
  const rubriques = $derived(nav?.rubriques ?? []);
</script>

<header class="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
  <div class="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6">
    <a href="/" class="shrink-0" aria-label="Agone — accueil"><Logo size={30} /></a>

    <nav class="ml-4 hidden items-center lg:flex">
      <!-- Antichambre ▾ rubriques -->
      <div class="group/drop relative">
        <a href="/antichambre" class="inline-flex items-center gap-1 px-3 py-2 font-display text-[15px] font-medium uppercase tracking-wide">
          <span class="text-link transition-opacity {isActive('/antichambre') || isActive('/article') ? 'opacity-100' : 'opacity-0 group-hover/drop:opacity-100'}">[</span>Antichambre<span class="text-link transition-opacity {isActive('/antichambre') || isActive('/article') ? 'opacity-100' : 'opacity-0 group-hover/drop:opacity-100'}">]</span>
          <CaretDown size={11} class="text-muted-foreground" />
        </a>
        {#if rubriques.length}
          <div class="invisible absolute left-0 top-full z-50 -translate-y-1 pt-1 opacity-0 transition-all duration-150 group-hover/drop:visible group-hover/drop:translate-y-0 group-hover/drop:opacity-100">
            <div class="min-w-[280px] rounded-md bg-popover py-2 text-popover-foreground shadow-2xl">
              {#each rubriques as r (r.slug)}
                <a href="/antichambre?rubrique={r.slug}" class="block px-4 py-1.5 font-display text-[15px] tracking-wide text-popover-foreground/70 hover:bg-white/5 hover:text-white">{r.name}</a>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- Catalogue ▾ collections -->
      <div class="group/drop relative">
        <a href="/catalogue" class="inline-flex items-center gap-1 px-3 py-2 font-display text-[15px] font-medium uppercase tracking-wide">
          <span class="text-link transition-opacity {isActive('/catalogue') || isActive('/livre') || isActive('/collections') ? 'opacity-100' : 'opacity-0 group-hover/drop:opacity-100'}">[</span>Catalogue<span class="text-link transition-opacity {isActive('/catalogue') || isActive('/livre') || isActive('/collections') ? 'opacity-100' : 'opacity-0 group-hover/drop:opacity-100'}">]</span>
          <CaretDown size={11} class="text-muted-foreground" />
        </a>
        {#if collections.length}
          <div class="invisible absolute left-0 top-full z-50 -translate-y-1 pt-1 opacity-0 transition-all duration-150 group-hover/drop:visible group-hover/drop:translate-y-0 group-hover/drop:opacity-100">
            <div class="min-w-[280px] rounded-md bg-popover py-2 text-popover-foreground shadow-2xl">
              {#each collections as c (c.slug)}
                <a href="/collections/{c.slug}" class="block px-4 py-1.5 font-display text-[15px] tracking-wide text-popover-foreground/70 hover:bg-white/5 hover:text-white">{c.name}</a>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- Simples -->
      <a href="/auteurs" class="group/n inline-flex items-center px-3 py-2 font-display text-[15px] font-medium uppercase tracking-wide">
        <span class="text-link transition-opacity {isActive('/auteurs') || isActive('/auteur') ? 'opacity-100' : 'opacity-0 group-hover/n:opacity-100'}">[</span>Auteurs<span class="text-link transition-opacity {isActive('/auteurs') || isActive('/auteur') ? 'opacity-100' : 'opacity-0 group-hover/n:opacity-100'}">]</span>
      </a>
      <a href="/rencontres" class="group/n inline-flex items-center px-3 py-2 font-display text-[15px] font-medium uppercase tracking-wide">
        <span class="text-link transition-opacity {isActive('/rencontres') ? 'opacity-100' : 'opacity-0 group-hover/n:opacity-100'}">[</span>Rencontres<span class="text-link transition-opacity {isActive('/rencontres') ? 'opacity-100' : 'opacity-0 group-hover/n:opacity-100'}">]</span>
      </a>
      <a href="/a-propos" class="group/n inline-flex items-center px-3 py-2 font-display text-[15px] font-medium uppercase tracking-wide">
        <span class="text-link transition-opacity {isActive('/a-propos') ? 'opacity-100' : 'opacity-0 group-hover/n:opacity-100'}">[</span>La maison<span class="text-link transition-opacity {isActive('/a-propos') ? 'opacity-100' : 'opacity-0 group-hover/n:opacity-100'}">]</span>
      </a>
    </nav>

    <div class="ml-auto flex items-center gap-1.5">
      <a href="/recherche" class="hidden size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground sm:grid" aria-label="Rechercher"><MagnifyingGlass size={18} /></a>
      <a href="/panier" class="relative grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Panier">
        <ShoppingCart size={18} />
        {#if cartCount > 0}<span class="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{cartCount}</span>{/if}
      </a>
      {#if user}
        <UserMenu {user} />
      {:else}
        <Button href="/connexion" variant="ghost" size="sm" class="hidden sm:inline-flex">Connexion</Button>
        <Button href="/inscription" variant="brand" size="sm" class="hidden sm:inline-flex">Compte</Button>
      {/if}
      <button class="grid size-9 place-items-center rounded-md hover:bg-muted lg:hidden" onclick={() => (open = !open)} aria-label="Menu">
        {#if open}<X size={20} />{:else}<List size={20} />{/if}
      </button>
    </div>
  </div>

  {#if open}
    <div class="border-t border-border bg-background lg:hidden">
      <nav class="mx-auto max-w-7xl px-4 py-3 font-display uppercase tracking-wide sm:px-6">
        <a href="/antichambre" onclick={() => (open = false)} class="block py-2 font-medium">Antichambre</a>
        {#each rubriques as r (r.slug)}<a href="/antichambre?rubrique={r.slug}" onclick={() => (open = false)} class="block py-1 pl-4 text-sm text-muted-foreground">{r.name}</a>{/each}
        <a href="/catalogue" onclick={() => (open = false)} class="mt-2 block py-2 font-medium">Catalogue</a>
        {#each collections as c (c.slug)}<a href="/collections/{c.slug}" onclick={() => (open = false)} class="block py-1 pl-4 text-sm text-muted-foreground">{c.name}</a>{/each}
        <a href="/auteurs" onclick={() => (open = false)} class="mt-2 block py-2 font-medium">Auteurs</a>
        <a href="/rencontres" onclick={() => (open = false)} class="block py-2 font-medium">Rencontres</a>
        <a href="/a-propos" onclick={() => (open = false)} class="block py-2 font-medium">La maison</a>
        {#if !user}
          <div class="mt-3 flex gap-2 border-t border-border pt-3">
            <Button href="/connexion" variant="outline" size="sm">Connexion</Button>
            <Button href="/inscription" variant="brand" size="sm">Compte</Button>
          </div>
        {/if}
      </nav>
    </div>
  {/if}
</header>
