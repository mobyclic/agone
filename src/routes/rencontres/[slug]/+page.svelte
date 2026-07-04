<script lang="ts">
  import VenueMap from '$lib/components/VenueMap.svelte';
  import { ArrowLeft, MapPin, CalendarBlank, Clock } from 'phosphor-svelte';

  let { data } = $props();
  const e = $derived(data.event);

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

<div class="mx-auto max-w-4xl px-4 py-8 sm:px-6">
  <a href="/rencontres" class="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
    <ArrowLeft size={16} /> Toutes les rencontres
  </a>

  {#if isPast}<span class="mb-3 inline-block rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Rencontre passée</span>{/if}
  <h1 class="text-3xl font-extrabold leading-tight tracking-tight">{e.title}</h1>

  <div class="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
    {#if e.start_at}
      <span class="inline-flex items-center gap-1.5 font-medium"><CalendarBlank size={16} class="text-primary" /> <span class="capitalize">{fmt(e.start_at)}</span></span>
      {#if time(e.start_at)}<span class="inline-flex items-center gap-1.5"><Clock size={16} class="text-primary" /> {time(e.start_at)}</span>{/if}
    {/if}
    {#if e.venue?.name}
      <span class="inline-flex items-center gap-1.5"><MapPin size={16} class="text-primary" /> {e.venue.name}{e.venue.city ? `, ${e.venue.city}` : ''}</span>
    {/if}
  </div>

  {#if e.authors.length}
    <p class="mt-3 text-sm">
      <span class="text-muted-foreground">Avec </span>
      {#each e.authors as a, i (a.slug)}<a href="/auteur/{a.slug}" class="font-medium text-primary hover:underline">{a.full_name}</a>{#if i < e.authors.length - 1}, {/if}{/each}
    </p>
  {/if}

  {#if e.body_html}
    <div class="prose-agone mt-6 max-w-none text-[15px] leading-relaxed [&_a]:text-primary [&_a:hover]:underline [&_p]:mb-3">
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
      {#if mapsUrl}<a href={mapsUrl} target="_blank" rel="noopener" class="mt-2 inline-block text-sm font-medium text-primary hover:underline">Itinéraire →</a>{/if}
    </section>
  {/if}

  <!-- Livres liés -->
  {#if e.books.length}
    <section class="mt-8">
      <h2 class="eyebrow mb-3">À propos {e.books.length > 1 ? 'des livres' : 'du livre'}</h2>
      <ul class="space-y-1">
        {#each e.books as b (b.slug)}
          <li><a href="/livre/{b.slug}" class="font-medium text-primary hover:underline">{b.title}</a></li>
        {/each}
      </ul>
    </section>
  {/if}
</div>
