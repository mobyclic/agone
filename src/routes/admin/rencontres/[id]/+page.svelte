<script lang="ts">
  import { enhance } from '$app/forms';
  import ImageUpload from '$lib/components/ImageUpload.svelte';
  import RichEditor from '$lib/components/RichEditor.svelte';
  import EntityPicker from '$lib/components/EntityPicker.svelte';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, FloppyDisk, Trash, MagnifyingGlass, X } from 'phosphor-svelte';

  let { data, form } = $props();
  const ev = $derived(data.event);

  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const label = 'mb-1 block text-sm font-medium';

  function toLocal(isoStr?: string) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // Cover
  let coverId = $state<string | null>(null);
  let coverUrl = $state<string | null>(null);
  // Dates
  let start = $state('');
  let end = $state('');
  // Venue
  let venueMode = $state<'existing' | 'new' | 'none'>('none');
  let venue = $state<{ id: string; label: string } | null>(null);
  let vq = $state('');
  let vhits = $state<{ id: string; name: string; city?: string }[]>([]);
  let vtimer: ReturnType<typeof setTimeout>;
  let vname = $state(''), vstreet = $state(''), vcity = $state(''), vpost = $state(''), vcountry = $state('France'), vlat = $state(''), vlng = $state('');

  $effect(() => {
    coverId = data.event?.cover_id ?? null;
    coverUrl = data.event?.cover_url ?? null;
    start = toLocal(data.event?.start_at);
    end = toLocal(data.event?.end_at);
    venue = data.event?.venue_id ? { id: data.event.venue_id, label: data.event.venue_label ?? 'Lieu' } : null;
    venueMode = data.event?.venue_id ? 'existing' : 'none';
    vq = ''; vhits = [];
  });

  function vsearch() {
    clearTimeout(vtimer);
    const t = vq.trim();
    if (t.length < 2) { vhits = []; return; }
    vtimer = setTimeout(async () => {
      const r = await fetch(`/admin/api/venues?q=${encodeURIComponent(t)}`);
      vhits = r.ok ? (await r.json()).results : [];
    }, 200);
  }
  function pickVenue(v: { id: string; name: string; city?: string }) {
    venue = { id: v.id, label: `${v.name}${v.city ? `, ${v.city}` : ''}` };
    vq = ''; vhits = [];
  }
</script>

<svelte:head><title>{data.isNew ? 'Nouvelle rencontre' : ev?.title} · Admin</title></svelte:head>

<a href="/admin/rencontres" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
  <ArrowLeft size={16} /> Rencontres
</a>

<form method="POST" action="?/save" use:enhance class="max-w-3xl">
  <div class="mb-4">
    <h2 class="text-xl font-bold">{data.isNew ? 'Nouvelle rencontre' : ev?.title}</h2>
  </div>

  {#if form?.error}<p class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}

  <div class="grid gap-6 sm:grid-cols-[1fr_220px]">
    <div class="space-y-5">
      <div class="rounded-lg border border-border bg-card p-4">
        <label class={label}>Titre <input name="title" value={ev?.title ?? ''} class={input} /></label>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <label class={label}>Début <input name="start_at" type="datetime-local" bind:value={start} class={input} /></label>
          <label class={label}>Fin <input name="end_at" type="datetime-local" bind:value={end} class={input} /></label>
        </div>
      </div>

      <!-- Lieu -->
      <div class="rounded-lg border border-border bg-card p-4">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="eyebrow">Lieu</h3>
          <div class="flex overflow-hidden rounded-md border border-border text-xs">
            <button type="button" class="px-3 py-1 {venueMode === 'existing' ? 'bg-foreground text-background' : ''}" onclick={() => (venueMode = 'existing')}>Existant</button>
            <button type="button" class="px-3 py-1 {venueMode === 'new' ? 'bg-foreground text-background' : ''}" onclick={() => (venueMode = 'new')}>Nouveau</button>
            <button type="button" class="px-3 py-1 {venueMode === 'none' ? 'bg-foreground text-background' : ''}" onclick={() => (venueMode = 'none')}>Aucun</button>
          </div>
        </div>

        {#if venueMode === 'existing'}
          {#if venue}
            <div class="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
              <span class="text-sm font-medium">{venue.label}</span>
              <button type="button" class="text-muted-foreground hover:text-foreground" onclick={() => (venue = null)} aria-label="Changer"><X size={16} /></button>
            </div>
          {:else}
            <div class="relative">
              <MagnifyingGlass size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input bind:value={vq} oninput={vsearch} placeholder="Rechercher un lieu…" autocomplete="off" class="{input} pl-9" />
            </div>
            {#if vhits.length}
              <ul class="mt-1 divide-y divide-border overflow-hidden rounded-md border border-border">
                {#each vhits as v (v.id)}
                  <li><button type="button" class="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/40" onclick={() => pickVenue(v)}>
                    <span class="font-medium">{v.name}</span>{#if v.city}<span class="text-xs text-muted-foreground">{v.city}</span>{/if}
                  </button></li>
                {/each}
              </ul>
            {/if}
          {/if}
        {:else if venueMode === 'new'}
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="{label} sm:col-span-2">Nom du lieu <input bind:value={vname} class={input} /></label>
            <label class="{label} sm:col-span-2">Rue <input bind:value={vstreet} class={input} /></label>
            <label class={label}>Code postal <input bind:value={vpost} class={input} /></label>
            <label class={label}>Ville <input bind:value={vcity} class={input} /></label>
            <label class={label}>Pays <input bind:value={vcountry} class={input} /></label>
            <div class="grid grid-cols-2 gap-2">
              <label class={label}>Latitude <input bind:value={vlat} class={input} placeholder="43.29" /></label>
              <label class={label}>Longitude <input bind:value={vlng} class={input} placeholder="5.37" /></label>
            </div>
          </div>
          <p class="mt-2 text-xs text-muted-foreground">Latitude/longitude optionnelles (pour la carte).</p>
        {:else}
          <p class="text-sm text-muted-foreground">Aucun lieu associé.</p>
        {/if}
      </div>

      <div class="rounded-lg border border-border bg-card p-4">
        <span class={label}>Description</span>
        {#key ev?.id}<RichEditor name="body_html" value={ev?.body_html ?? ''} minHeight="14rem" />{/key}
      </div>
    </div>

    <div class="space-y-5">
      <div class="rounded-lg border border-border bg-card p-4">
        <h3 class="eyebrow mb-3">Couverture</h3>
        <ImageUpload bind:mediaId={coverId} bind:url={coverUrl} folder="rencontres" kind="cover" label="" accept="image/*" />
        <input type="hidden" name="coverId" value={coverId ?? ''} />
      </div>
      <div class="rounded-lg border border-border bg-card p-4">
        <h3 class="eyebrow mb-3">Auteurs</h3>
        {#key ev?.id}<EntityPicker name="authorIds" searchUrl="/api/authors/search" labelField="full_name" initial={ev?.authors ?? []} placeholder="Ajouter un auteur…" />{/key}
      </div>
      <div class="rounded-lg border border-border bg-card p-4">
        <h3 class="eyebrow mb-3">Livres associés</h3>
        {#key ev?.id}<EntityPicker name="bookIds" searchUrl="/api/books/search" labelField="title" initial={ev?.books ?? []} placeholder="Associer un livre…" />{/key}
      </div>
    </div>
  </div>

  <!-- Champs cachés lieu -->
  <input type="hidden" name="venueMode" value={venueMode} />
  <input type="hidden" name="venueId" value={venue?.id ?? ''} />
  <input type="hidden" name="venueName" value={vname} />
  <input type="hidden" name="venueStreet" value={vstreet} />
  <input type="hidden" name="venueCity" value={vcity} />
  <input type="hidden" name="venuePostcode" value={vpost} />
  <input type="hidden" name="venueCountry" value={vcountry} />
  <input type="hidden" name="venueLat" value={vlat} />
  <input type="hidden" name="venueLng" value={vlng} />

  <!-- Bouton flottant -->
  <div class="fixed bottom-6 right-6 z-40">
    <Button type="submit" variant="brand" class="shadow-2xl"><FloppyDisk size={16} /> Enregistrer</Button>
  </div>
</form>

{#if !data.isNew}
  <form method="POST" action="?/delete" use:enhance class="mt-6 max-w-3xl border-t border-border pt-4">
    <Button type="submit" variant="ghost" size="sm" class="text-destructive hover:bg-destructive/10"
      onclick={(e: Event) => { if (!confirm('Supprimer cette rencontre ?')) e.preventDefault(); }}>
      <Trash size={15} /> Supprimer cette rencontre
    </Button>
  </form>
{/if}
