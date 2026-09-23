<script lang="ts">
  import { page } from '$app/state';
  import Wordmark from './Wordmark.svelte';
  import Icon from './Icon.svelte';
  import type { NavItem, NavSection } from '$lib/nav';
  import { List, X, SignOut, ArrowSquareOut, ArrowRight } from 'phosphor-svelte';

  let {
    items,
    sections,
    user,
    title = '',
    children
  }: {
    items?: NavItem[];
    sections?: NavSection[];
    user: NonNullable<App.Locals['user']>;
    title?: string;
    children: import('svelte').Snippet;
  } = $props();

  // Accepte soit des sections, soit une liste plate (repli en une section sans titre).
  const navSections = $derived<NavSection[]>(sections ?? (items ? [{ items }] : []));

  let open = $state(false);
  const isActive = (href: string) =>
    page.url.pathname === href ||
    (href !== '/admin' && href !== '/compte' && page.url.pathname.startsWith(href + '/'));

  const initials = $derived(
    ((user.first_name?.[0] ?? '') + (user.last_name?.[0] ?? '')).toUpperCase() ||
      (user.email?.[0] ?? '?').toUpperCase()
  );
</script>

<!-- Grille : la 1re colonne prend EXACTEMENT la largeur du bandeau logo (le nav
     ne compte pas dans le calcul : w-0 min-w-full), si bien que la barre latérale
     et le bandeau font la même largeur, et le logo tombe au pixel près là où il
     est sur le front (même gouttière, même --logo-extra, même pr-6). -->
<div class="min-h-svh bg-muted/30 lg:grid lg:grid-cols-[auto_minmax(0,1fr)]">
  <!-- Sidebar (collante sur grand écran) -->
  <aside
    class="fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:sticky lg:top-0 lg:h-svh lg:w-auto lg:translate-x-0 {open
      ? 'translate-x-0'
      : '-translate-x-full'}"
  >
    <!-- Bandeau logo : copie conforme du front, couleurs inversées (noir sur blanc). -->
    <div class="relative flex h-16 shrink-0 items-center bg-background pr-6 text-foreground" style="padding-left: calc(var(--page-gutter) + var(--logo-extra, 0px))">
      <button class="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-foreground/60 hover:bg-muted hover:text-foreground lg:hidden" onclick={() => (open = false)} aria-label="Fermer">
        <X size={18} />
      </button>
      <a href="/" aria-label="Agone — accueil"><Wordmark /></a>
    </div>

    <nav class="nav-defile flex-1 space-y-1.5 overflow-y-auto px-3 pb-2 pt-5 lg:w-0 lg:min-w-full">
      {#each navSections as section, si (section.title ?? `_${si}`)}
        <div class="space-y-0.5">
          {#if section.title}
            <p class="px-3 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">{section.title}</p>
          {/if}
          {#each section.items as item (item.href)}
            <a
              href={item.href}
              onclick={() => (open = false)}
              aria-current={isActive(item.href) ? 'page' : undefined}
              class="flex items-center gap-2.5 rounded-md py-1 pl-1 pr-3 text-sm font-medium transition-colors {isActive(item.href)
                ? 'font-semibold text-white'
                : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}"
            >
              <!-- Élément actif : une flèche devant (emplacement réservé → pas de décalage). -->
              <span class="grid w-3.5 shrink-0 place-items-center">
                {#if isActive(item.href)}<ArrowRight size={14} weight="bold" class="text-link" />{/if}
              </span>
              <Icon name={item.icon} size={18} />
              {item.label}
            </a>
          {/each}
        </div>
      {/each}
    </nav>

    <div class="border-t border-sidebar-border p-3 lg:w-0 lg:min-w-full">
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
    <!-- Barre haute : noire, texte blanc (l'inverse du front). -->
    <header class="sticky top-0 z-20 flex h-16 items-center gap-3 bg-foreground px-4 text-background sm:px-6">
      <button class="grid size-9 place-items-center rounded-md hover:bg-background/10 lg:hidden" onclick={() => (open = true)} aria-label="Menu">
        <List size={20} />
      </button>
      <h1 class="text-base font-semibold">{title}</h1>
    </header>
    <main class="flex-1 p-5 sm:p-6 lg:p-8">
      {@render children()}
    </main>
  </div>
</div>

<style>
  /* Défilement discret de la navigation (si l'écran est trop bas pour tout afficher). */
  .nav-defile { scrollbar-width: thin; scrollbar-color: rgb(255 255 255 / 0.15) transparent; }
  .nav-defile::-webkit-scrollbar { width: 6px; }
  .nav-defile::-webkit-scrollbar-thumb { background: rgb(255 255 255 / 0.15); border-radius: 3px; }
  .nav-defile::-webkit-scrollbar-track { background: transparent; }
</style>
