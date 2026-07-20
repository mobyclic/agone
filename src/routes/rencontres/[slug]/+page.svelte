<script lang="ts">
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import VenueMap from '$lib/components/VenueMap.svelte';
  import PageHead from '$lib/components/PageHead.svelte';
  import { MapPin, CalendarBlank, Clock, PencilSimple } from 'phosphor-svelte';

  let { data } = $props();
  const e = $derived(data.event);
  const isStaff = $derived(['admin', 'editor'].includes(page.data.user?.role ?? ''));

  const fmt = (s?: string) =>
    s ? new Date(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const time = (s?: string) => {
    if (!s) return '';
    const d = new Date(s);
    return d.getHours() || d.getMinutes() ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
  };
  const isPast = $derived(e.start_at ? new Date(e.start_at) < new Date() : false);
  const mapsUrl = $derived(
    e.venue?.place_id
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.venue.name)}&query_place_id=${e.venue.place_id}`
      : e.venue?.lat != null
        ? `https://www.openstreetmap.org/?mlat=${e.venue.lat}&mlon=${e.venue.lng}#map=16/${e.venue.lat}/${e.venue.lng}`
        : null
  );
</script>

<svelte:head><title>{e.title} · Rencontres Agone</title></svelte:head>

<PageHead eyebrow="Rencontres" title={e.title} width="max-w-7xl" inner={data.books.length ? 'lg:max-w-[calc(100%_-_400px)]' : 'max-w-4xl'} />

{#if isStaff}
  <div class="fixed bottom-6 right-6 z-40">
    <Button href="/admin/rencontres/{e.id}" variant="outline" class="bg-background shadow-2xl"><PencilSimple size={16} /> Éditer</Button>
  </div>
{/if}

<div class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
  <div class="grid gap-10 lg:items-start {data.books.length ? 'lg:grid-cols-[minmax(0,1fr)_360px]' : ''}">
    <div class="min-w-0 {data.books.length ? '' : 'max-w-4xl'}">
  {#if isPast}<span class="mb-3 inline-block rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Rencontre passée</span>{/if}

  <div class="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
    {#if e.start_at}
      <span class="inline-flex items-center gap-1.5 font-medium"><CalendarBlank size={16} class="text-link" /> <span class="capitalize">{fmt(e.start_at)}</span></span>
      {#if time(e.start_at)}<span class="inline-flex items-center gap-1.5"><Clock size={16} class="text-link" /> {time(e.start_at)}</span>{/if}
    {/if}
    {#if e.venue?.name}
      <span class="inline-flex items-center gap-1.5"><MapPin size={16} class="text-link" /> {e.venue.name}{e.venue.city ? `, ${e.venue.city}` : ''}</span>
    {/if}
  </div>

  {#if e.authors.length}
    <p class="mt-3 text-sm">
      <span class="text-muted-foreground">Avec </span>
      {#each e.authors as a, i (a.slug)}<a href="/auteur/{a.slug}" class="font-medium text-link hover:underline">{a.full_name}</a>{#if i < e.authors.length - 1}, {/if}{/each}
    </p>
  {/if}

  {#if e.body_html}
    <div class="prose-agone mt-6 max-w-none text-[15px] leading-relaxed [&_a]:text-link [&_a:hover]:underline [&_p]:mb-3">
      {@html e.body_html}
    </div>
  {/if}

  <!-- Lieu + carte -->
  {#if e.venue}
    <section class="mt-8 rounded-lg border border-border bg-card p-4">
      <h2 class="eyebrow mb-3">Le lieu</h2>
      <p class="font-semibold">{e.venue.name}</p>
      {#if e.venue.address}<p class="text-sm text-muted-foreground">{e.venue.address}</p>{/if}
      {#if (e.venue.event_count ?? 0) > 1}
        <p class="mt-1 text-xs text-muted-foreground">Agone y a organisé {e.venue.event_count} rencontres.</p>
      {/if}
      {#if e.venue.lat != null && e.venue.lng != null}
        <div class="mt-3">
          {#key e.slug}
            <VenueMap lat={e.venue.lat} lng={e.venue.lng} name={e.venue.name} />
          {/key}
        </div>
      {/if}
      {#if mapsUrl}<a href={mapsUrl} target="_blank" rel="noopener" class="mt-2 inline-block text-sm font-medium text-link hover:underline">Itinéraire →</a>{/if}
    </section>
  {/if}

    </div>

    {#if data.books.length}
      <aside class="lg:sticky lg:top-28">
        <h2 class="eyebrow mb-4">{data.books.length > 1 ? 'Les livres' : 'Le livre'}</h2>
        <div class="space-y-6">
          {#each data.books as book (book.slug)}
            <a href="/livre/{book.slug}" class="group flex gap-4">
              <span class="aspect-[2/3] w-32 shrink-0 overflow-hidden border border-border bg-muted">
                {#if book.cover_url}<img src={book.cover_url} alt="" loading="lazy" class="size-full object-cover" />{/if}
              </span>
              <span class="min-w-0">
                <span class="line-clamp-3 font-display text-base font-medium uppercase leading-tight group-hover:text-link">{book.title}</span>
                {#if book.authors?.length}<span class="mt-1 block text-sm text-link">{book.authors[0].name}</span>{/if}
              </span>
            </a>
          {/each}
        </div>
      </aside>
    {/if}
  </div>
</div>
