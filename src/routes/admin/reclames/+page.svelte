<script lang="ts">
  /** Réclames : bandeau d'information en haut du site, fenêtre promotionnelle à l'arrivée. */
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { FloppyDisk } from 'phosphor-svelte';
  let { data } = $props();
  const label = 'mb-1 block text-sm font-medium';
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
</script>

<svelte:head><title>Réclames · Admin Agone</title></svelte:head>

<div class="mb-5">
  <h2 class="text-xl font-bold">Réclames</h2>
  <p class="text-sm text-muted-foreground">Ce que le site annonce de lui-même : un bandeau en haut de page, une fenêtre à l'arrivée du visiteur.</p>
</div>

<div class="grid gap-5 lg:grid-cols-2 lg:items-start">
  <form method="POST" action="?/banner" use:enhance class="rounded-lg border border-border bg-card p-5">
    <h3 class="eyebrow mb-1">Bandeau d'information</h3>
    <p class="mb-4 text-xs text-muted-foreground">Une ligne au-dessus du menu, sur toutes les pages. Pour une parution, une fermeture, un salon.</p>
    <div class="space-y-4">
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="active" checked={data.banner.active} class="size-4 rounded border-border" /> Afficher le bandeau</label>
      <div><label class={label} for="message">Message</label><textarea id="message" name="message" rows="2" class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">{data.banner.message}</textarea></div>
      <div><label class={label} for="url">Lien (facultatif)</label><input id="url" name="url" value={data.banner.url} placeholder="/livre/… ou https://…" class={input} /></div>
      <div>
        <label class={label} for="variant">Style</label>
        <select id="variant" name="variant" value={data.banner.variant} class={input}>
          <option value="info">Information (noir)</option>
          <option value="brand">Marque (rouge)</option>
          <option value="warning">Avertissement</option>
          <option value="success">Succès</option>
        </select>
      </div>
    </div>
    <div class="mt-4"><Button type="submit"><FloppyDisk size={16} /> Enregistrer</Button></div>
  </form>

  <form method="POST" action="?/popup" use:enhance class="rounded-lg border border-border bg-card p-5">
    <h3 class="eyebrow mb-1">Fenêtre promotionnelle</h3>
    <p class="mb-4 text-xs text-muted-foreground">S'ouvre à l'arrivée sur le site, se ferme d'un clic, et ne revient qu'au rythme choisi. Un texte modifié se remontre à tous.</p>
    <div class="space-y-4">
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="active" checked={data.popup.active} class="size-4 rounded border-border" /> Afficher la fenêtre</label>
      <div><label class={label} for="p-title">Titre</label><input id="p-title" name="title" value={data.popup.title} class={input} /></div>
      <div><label class={label} for="p-body">Texte</label><textarea id="p-body" name="body" rows="4" class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">{data.popup.body}</textarea></div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div><label class={label} for="p-cta">Bouton</label><input id="p-cta" name="cta_label" value={data.popup.cta_label} placeholder="Découvrir" class={input} /></div>
        <div><label class={label} for="p-url">Lien du bouton</label><input id="p-url" name="cta_url" value={data.popup.cta_url} placeholder="/catalogue" class={input} /></div>
      </div>
      <div><label class={label} for="p-img">Image (adresse, facultatif)</label><input id="p-img" name="image_url" value={data.popup.image_url} placeholder="https://… (une couverture, une affiche)" class={input} /></div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div><label class={label} for="p-start">Du</label><input id="p-start" type="date" name="starts_at" value={data.popup.starts_at} class={input} /></div>
        <div><label class={label} for="p-end">Au</label><input id="p-end" type="date" name="ends_at" value={data.popup.ends_at} class={input} /></div>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label class={label} for="p-freq">Fréquence</label>
          <select id="p-freq" name="frequency" value={data.popup.frequency} class={input}>
            <option value="once">Une seule fois par visiteur</option>
            <option value="day">Une fois par jour</option>
            <option value="session">À chaque visite</option>
            <option value="always">À chaque page</option>
          </select>
        </div>
        <div><label class={label} for="p-delay">Délai d'apparition (s)</label><input id="p-delay" type="number" min="0" max="60" name="delay" value={data.popup.delay} class={input} /></div>
      </div>
    </div>
    <div class="mt-4"><Button type="submit"><FloppyDisk size={16} /> Enregistrer</Button></div>
  </form>
</div>
