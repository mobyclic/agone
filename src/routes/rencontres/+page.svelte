<script lang="ts">
  import { MapPin, CalendarBlank } from 'phosphor-svelte';
  let { data } = $props();

  const fmt = (s?: string) =>
    s ? new Date(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const fmtTime = (s?: string) => {
    if (!s) return '';
    const d = new Date(s);
    return d.getHours() || d.getMinutes() ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
  };
  const fmtShort = (s?: string) =>
    s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
</script>

<svelte:head><title>Rencontres · Agone</title></svelte:head>

<section class="border-b border-border bg-secondary/40">
  <div class="mx-auto max-w-5xl px-4 py-10 sm:px-6">
    <p class="eyebrow">L’agenda</p>
    <h1 class="mt-1 text-3xl font-extrabold tracking-tight">Rencontres</h1>
    <p class="mt-2 text-muted-foreground">Débats, tables rondes et présentations autour des livres et des auteurs.</p>
  </div>
</section>

<div class="mx-auto max-w-5xl px-4 py-10 sm:px-6">
  <!-- À venir -->
  <section>
    <h2 class="text-xl font-bold tracking-tight">À venir</h2>
    {#if data.upcoming.length === 0}
      <p class="mt-4 text-muted-foreground">Aucune rencontre programmée pour le moment.</p>
    {:else}
      <div class="mt-5 space-y-3">
        {#each data.upcoming as e (e.slug)}
          <a href="/rencontres/{e.slug}" class="group flex gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary">
            <div class="flex w-16 shrink-0 flex-col items-center justify-center rounded-md bg-sidebar py-2 text-sidebar-foreground">
              <span class="text-2xl font-bold leading-none">{e.start_at ? new Date(e.start_at).getDate() : ''}</span>
              <span class="text-[11px] uppercase">{e.start_at ? new Date(e.start_at).toLocaleDateString('fr-FR', { month: 'short' }) : ''}</span>
            </div>
            <div class="min-w-0">
              <h3 class="font-semibold leading-snug group-hover:text-primary">{e.title}</h3>
              <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span class="inline-flex items-center gap-1"><CalendarBlank size={14} /> {fmt(e.start_at)}{fmtTime(e.start_at) ? ` · ${fmtTime(e.start_at)}` : ''}</span>
                {#if e.venue_name}<span class="inline-flex items-center gap-1"><MapPin size={14} /> {e.venue_name}{e.venue_city ? `, ${e.venue_city}` : ''}</span>{/if}
              </div>
              {#if e.author_names.length}<p class="mt-1 text-sm">{e.author_names.join(', ')}</p>{/if}
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Passées -->
  {#if data.past.length}
    <section class="mt-14">
      <h2 class="text-xl font-bold tracking-tight">Rencontres passées</h2>
      <ul class="mt-5 divide-y divide-border border-y border-border">
        {#each data.past as e (e.slug)}
          <li>
            <a href="/rencontres/{e.slug}" class="group flex flex-wrap items-baseline gap-x-3 py-3 hover:bg-muted/40">
              <span class="w-28 shrink-0 text-sm text-muted-foreground">{fmtShort(e.start_at)}</span>
              <span class="min-w-0 flex-1 font-medium group-hover:text-primary">{e.title}</span>
              {#if e.venue_city}<span class="text-sm text-muted-foreground">{e.venue_city}</span>{/if}
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>
