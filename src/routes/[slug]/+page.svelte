<script lang="ts">
  import { enhance } from '$app/forms';
  import { page as appPage } from '$app/state';
  import { beforeNavigate } from '$app/navigation';
  import StaticPage from '$lib/components/StaticPage.svelte';
  import RichEditor from '$lib/components/RichEditor.svelte';
  import { Button } from '$lib/components/ui/button';
  import { PencilSimple, FloppyDisk, X, Spinner } from 'phosphor-svelte';

  let { data, form } = $props();
  const isStaff = $derived(['admin', 'editor'].includes(appPage.data.user?.role ?? ''));

  let editing = $state(false);
  let saving = $state(false);
  let dirty = $state(false);

  // Quitter la page en cours d'édition perdrait la saisie : on prévient.
  beforeNavigate((nav) => {
    if (!editing || !dirty || saving) return;
    if (!confirm('Des modifications ne sont pas enregistrées. Quitter cette page ?')) nav.cancel();
  });

  function stopEditing() {
    if (dirty && !confirm('Abandonner les modifications en cours ?')) return;
    editing = false;
    dirty = false;
  }
</script>

<svelte:head><title>{data.page.title} · Agone</title></svelte:head>

{#if editing}
  <form
    method="POST"
    action="?/save"
    use:enhance={() => {
      saving = true;
      return async ({ update }) => {
        await update({ reset: false });
        saving = false;
        editing = false;
        dirty = false;
      };
    }}
    oninput={() => (dirty = true)}
    onchange={() => (dirty = true)}
  >
    <!-- Même gabarit que PageHead : l'édition reste dans la mise en page publique. -->
    <section class="bg-background text-foreground">
      <div class="max-w-3xl py-10 sm:py-14" style="padding-inline: var(--page-gutter)">
        <p class="font-display text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Édition en place</p>
        <input
          name="title"
          value={data.page.title}
          aria-label="Titre de la page"
          class="display-title mt-2 w-full border-b border-dashed border-border bg-transparent text-4xl leading-[0.9] outline-none focus:border-primary sm:text-5xl"
        />
      </div>
    </section>

    <div class="max-w-3xl pb-28" style="padding-inline: var(--page-gutter)">
      {#if form?.error}
        <p class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>
      {/if}
      {#key data.page.slug}
        <RichEditor name="body_html" value={data.page.body_html ?? ''} minHeight="26rem" onchange={() => (dirty = true)} />
      {/key}
    </div>

    <div class="fixed bottom-6 right-6 z-40 flex gap-2">
      <Button type="button" variant="outline" class="bg-background shadow-2xl" onclick={stopEditing}>
        <X size={16} /> Annuler
      </Button>
      {#if saving}
        <Button type="submit" variant="brand" disabled class="shadow-2xl"><Spinner size={16} class="animate-spin" /> Enregistrement…</Button>
      {:else}
        <Button type="submit" variant="brand" class="shadow-2xl"><FloppyDisk size={16} /> Enregistrer</Button>
      {/if}
    </div>
  </form>
{:else}
  <StaticPage title={data.page.title} html={data.page.body_html} />

  {#if isStaff}
    <div class="fixed bottom-6 right-6 z-40">
      <Button type="button" variant="outline" class="bg-background shadow-2xl" onclick={() => (editing = true)}>
        <PencilSimple size={16} /> Éditer
      </Button>
    </div>
  {/if}
{/if}
