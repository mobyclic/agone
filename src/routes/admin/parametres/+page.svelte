<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { FloppyDisk } from 'phosphor-svelte';

  let { data } = $props();
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const label = 'mb-1 block text-sm font-medium';
</script>

<svelte:head><title>Paramètres · Admin Agone</title></svelte:head>

<div class="mb-6">
  <h2 class="text-xl font-bold">Paramètres</h2>
  <p class="text-sm text-muted-foreground">Coordonnées publiques et bandeau d'information du site.</p>
</div>

<div class="grid gap-6 lg:grid-cols-2">
  <!-- Coordonnées -->
  <form method="POST" action="?/contact" use:enhance class="rounded-lg border border-border bg-card p-5">
    <h3 class="mb-4 text-base font-semibold">Coordonnées</h3>
    <div class="space-y-4">
      <div>
        <label class={label} for="email">E-mail de contact</label>
        <input id="email" name="email" type="email" value={data.contact.email} class={input} />
      </div>
      <div>
        <label class={label} for="phone">Téléphone</label>
        <input id="phone" name="phone" value={data.contact.phone} class={input} />
      </div>
      <div>
        <label class={label} for="address">Adresse</label>
        <textarea id="address" name="address" rows="3" class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">{data.contact.address}</textarea>
      </div>
    </div>
    <div class="mt-4"><Button type="submit"><FloppyDisk size={16} /> Enregistrer</Button></div>
  </form>

  <!-- Bannière -->
  <form method="POST" action="?/banner" use:enhance class="rounded-lg border border-border bg-card p-5">
    <h3 class="mb-4 text-base font-semibold">Bandeau d'information</h3>
    <div class="space-y-4">
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" checked={data.banner.active} class="size-4 rounded border-border" />
        Afficher le bandeau en haut du site
      </label>
      <div>
        <label class={label} for="message">Message</label>
        <textarea id="message" name="message" rows="3" class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">{data.banner.message}</textarea>
      </div>
      <div>
        <label class={label} for="variant">Style</label>
        <select id="variant" name="variant" value={data.banner.variant} class={input}>
          <option value="info">Information</option>
          <option value="brand">Marque (rouge)</option>
          <option value="warning">Avertissement</option>
          <option value="success">Succès</option>
        </select>
      </div>
    </div>
    <div class="mt-4"><Button type="submit"><FloppyDisk size={16} /> Enregistrer</Button></div>
  </form>
</div>
