<script lang="ts">
  import { page } from '$app/state';
  import Logo from './Logo.svelte';
  import UserMenu from './UserMenu.svelte';
  import { Button } from '$lib/components/ui/button';
  import { PUBLIC_NAV } from '$lib/nav';
  import { List, X, MagnifyingGlass } from 'phosphor-svelte';

  let { user }: { user: App.Locals['user'] } = $props();
  let open = $state(false);

  const isActive = (href: string) =>
    page.url.pathname === href || page.url.pathname.startsWith(href + '/');
</script>

<header class="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
  <div class="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
    <a href="/" class="shrink-0" aria-label="Agone — accueil"><Logo size={30} /></a>

    <nav class="ml-4 hidden items-center gap-1 lg:flex">
      {#each PUBLIC_NAV as item (item.href)}
        <a
          href={item.href}
          class="rounded-md px-3 py-2 text-sm font-medium transition-colors {isActive(item.href)
            ? 'text-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted'}"
        >
          {item.label}
        </a>
      {/each}
    </nav>

    <div class="ml-auto flex items-center gap-2">
      <a href="/recherche" class="hidden size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground sm:grid" aria-label="Rechercher">
        <MagnifyingGlass size={18} />
      </a>
      <a href="/panier" class="hidden rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground sm:inline-flex">
        Panier
      </a>
      {#if user}
        <UserMenu {user} />
      {:else}
        <Button href="/connexion" variant="ghost" size="sm" class="hidden sm:inline-flex">Connexion</Button>
        <Button href="/inscription" variant="brand" size="sm" class="hidden sm:inline-flex">Créer un compte</Button>
      {/if}
      <button
        class="grid size-9 place-items-center rounded-md hover:bg-muted lg:hidden"
        onclick={() => (open = !open)}
        aria-label="Menu"
      >
        {#if open}<X size={20} />{:else}<List size={20} />{/if}
      </button>
    </div>
  </div>

  {#if open}
    <div class="border-t border-border bg-background lg:hidden">
      <nav class="mx-auto max-w-7xl px-4 py-3 sm:px-6">
        {#each PUBLIC_NAV as item (item.href)}
          <a
            href={item.href}
            onclick={() => (open = false)}
            class="block rounded-md px-3 py-2.5 text-sm font-medium {isActive(item.href)
              ? 'bg-muted text-primary'
              : 'text-foreground hover:bg-muted'}"
          >
            {item.label}
          </a>
        {/each}
        <a href="/panier" onclick={() => (open = false)} class="block rounded-md px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted">Panier</a>
        {#if !user}
          <div class="mt-3 flex gap-2 border-t border-border pt-3">
            <Button href="/connexion" variant="outline" size="sm">Connexion</Button>
            <Button href="/inscription" variant="brand" size="sm">Créer un compte</Button>
          </div>
        {/if}
      </nav>
    </div>
  {/if}
</header>
