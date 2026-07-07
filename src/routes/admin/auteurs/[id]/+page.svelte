<script lang="ts">
  import { enhance } from '$app/forms';
  import ImageUpload from '$lib/components/ImageUpload.svelte';
  import RichEditor from '$lib/components/RichEditor.svelte';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, FloppyDisk, Trash } from 'phosphor-svelte';

  let { data, form } = $props();
  const a = $derived(data.author);

  let portraitId = $state<string | null>(null);
  let portraitUrl = $state<string | null>(null);
  $effect(() => {
    portraitId = data.author?.portrait ? String(data.author.portrait) : null;
    portraitUrl = data.author?.portrait_url ?? null;
  });

  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const label = 'mb-1 block text-sm font-medium';
</script>

<svelte:head><title>{data.isNew ? 'Nouvel auteur' : a?.full_name} · Admin</title></svelte:head>

<a href="/admin/auteurs" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
  <ArrowLeft size={16} /> Auteurs
</a>

<form method="POST" action="?/save" use:enhance class="max-w-3xl">
  <div class="mb-4">
    <h2 class="text-xl font-bold">{data.isNew ? 'Nouvel auteur' : a?.full_name}</h2>
  </div>

  {#if form?.error}<p class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}

  <div class="grid gap-6 sm:grid-cols-[1fr_220px]">
    <div class="space-y-5">
      <div class="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
        <label class={label}>Prénom <input name="first_name" value={a?.first_name ?? ''} class={input} /></label>
        <label class={label}>Nom <input name="last_name" value={a?.last_name ?? ''} class={input} /></label>
        <label class={label}>Nationalité <input name="nationality" value={a?.nationality ?? ''} class={input} /></label>
        <label class={label}>Site web <input name="website" value={a?.website ?? ''} class={input} /></label>
        <label class={label}>Naissance <input name="birth_year" type="number" value={a?.birth_year ?? ''} class={input} /></label>
        <label class={label}>Décès <input name="death_year" type="number" value={a?.death_year ?? ''} class={input} /></label>
      </div>

      <div class="rounded-lg border border-border bg-card p-4">
        <span class={label}>Biographie</span>
        {#key a?.id}<RichEditor name="bio_html" value={a?.bio_html ?? ''} minHeight="10rem" />{/key}
      </div>

      <div class="rounded-lg border border-border bg-card p-4">
        <h3 class="eyebrow mb-3">Identité fiscale (paiement des droits — confidentiel)</h3>
        <div class="grid gap-4 sm:grid-cols-2">
          <label class={label}>Nom légal <input name="legal_name" value={a?.legal_name ?? ''} class={input} /></label>
          <label class={label}>SIRET <input name="siret" value={a?.siret ?? ''} class={input} /></label>
        </div>
      </div>
    </div>

    <div class="space-y-5">
      <div class="rounded-lg border border-border bg-card p-4">
        <h3 class="eyebrow mb-3">Portrait</h3>
        <ImageUpload bind:mediaId={portraitId} bind:url={portraitUrl} folder="auteurs" kind="image" label="" accept="image/*" />
        <input type="hidden" name="portraitId" value={portraitId ?? ''} />
      </div>
      <div class="rounded-lg border border-border bg-card p-4">
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" name="hidden" checked={a?.hidden} class="size-4 rounded border-border" /> Masquer de la liste publique
        </label>
      </div>
    </div>
  </div>

  <!-- Bouton flottant -->
  <div class="fixed bottom-6 right-6 z-40">
    <Button type="submit" variant="brand" class="shadow-2xl"><FloppyDisk size={16} /> Enregistrer</Button>
  </div>
</form>

{#if !data.isNew}
  <form method="POST" action="?/delete" use:enhance class="mt-6 max-w-3xl border-t border-border pt-4">
    <Button type="submit" variant="ghost" size="sm" class="text-destructive hover:bg-destructive/10"
      onclick={(e: Event) => { if (!confirm('Supprimer cet auteur ?')) e.preventDefault(); }}>
      <Trash size={15} /> Supprimer cet auteur
    </Button>
  </form>
{/if}
