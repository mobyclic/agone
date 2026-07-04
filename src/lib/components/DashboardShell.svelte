<script lang="ts">
  import { page } from '$app/state';
  import Logo from './Logo.svelte';
  import Icon from './Icon.svelte';
  import type { NavItem } from '$lib/nav';
  import { List, X, SignOut, ArrowSquareOut } from 'phosphor-svelte';

  let {
    items,
    user,
    title = '',
    children
  }: {
    items: NavItem[];
    user: NonNullable<App.Locals['user']>;
    title?: string;
    children: import('svelte').Snippet;
  } = $props();

  let open = $state(false);
  const isActive = (href: string) =>
    page.url.pathname === href ||
    (href !== '/admin' && href !== '/compte' && page.url.pathname.startsWith(href + '/'));

  const initials = $derived(
    ((user.first_name?.[0] ?? '') + (user.last_name?.[0] ?? '')).toUpperCase() ||
      (user.email?.[0] ?? '?').toUpperCase()
  );
</script>

<div class="flex min-h-svh bg-muted/30">
  <!-- Sidebar -->
  <aside
    class="fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0 {open
      ? 'translate-x-0'
      : '-translate-x-full'}"
  >
    <div class="flex h-16 items-center justify-between px-4">
      <a href="/"><Logo size={26} tone="light" /></a>
      <button class="grid size-8 place-items-center rounded-md hover:bg-sidebar-accent lg:hidden" onclick={() => (open = false)} aria-label="Fermer">
        <X size={18} />
      </button>
    </div>

    <nav class="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
      {#each items as item (item.href)}
        <a
          href={item.href}
          onclick={() => (open = false)}
          class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors {isActive(item.href)
            ? 'bg-sidebar-primary text-sidebar-primary-foreground'
            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}"
        >
          <Icon name={item.icon} size={18} />
          {item.label}
        </a>
      {/each}
    </nav>

    <div class="border-t border-sidebar-border p-3">
      <div class="mb-2 flex items-center gap-2 px-1">
        <span class="grid size-8 place-items-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-xs font-bold">
          {initials}
        </span>
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium">{user.full_name || user.email}</div>
          <div class="truncate text-xs text-sidebar-foreground/60">{user.email}</div>
        </div>
      </div>
      <div class="flex items-center gap-1">
        <a href="/" class="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent">
          <ArrowSquareOut size={14} /> Voir le site
        </a>
        <a href="/deconnexion" data-sveltekit-reload class="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent">
          <SignOut size={14} /> Déconnexion
        </a>
      </div>
    </div>
  </aside>

  {#if open}
    <button class="fixed inset-0 z-30 bg-black/40 lg:hidden" onclick={() => (open = false)} aria-label="Fermer"></button>
  {/if}

  <!-- Main -->
  <div class="flex min-w-0 flex-1 flex-col">
    <header class="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background px-4 sm:px-6">
      <button class="grid size-9 place-items-center rounded-md hover:bg-muted lg:hidden" onclick={() => (open = true)} aria-label="Menu">
        <List size={20} />
      </button>
      <h1 class="text-base font-semibold">{title}</h1>
    </header>
    <main class="flex-1 p-5 sm:p-6 lg:p-8">
      {@render children()}
    </main>
  </div>
</div>
