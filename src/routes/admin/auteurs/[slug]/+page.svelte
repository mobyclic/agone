<script lang="ts">
  import { enhance } from '$app/forms';
  import ImageUpload from '$lib/components/ImageUpload.svelte';
  import RichEditor from '$lib/components/RichEditor.svelte';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, FloppyDisk, Trash, Coins, Warning } from 'phosphor-svelte';
  import { euros } from '$lib/labels';

  let { data, form } = $props();
  const a = $derived(data.author);
  const hasBooks = $derived((a?.book_count ?? 0) > 0);

  let portraitId = $state<string | null>(null);
  let portraitUrl = $state<string | null>(null);
  let showDelete = $state(false);
  $effect(() => {
    portraitId = data.author?.portrait ? String(data.author.portrait) : null;
    portraitUrl = data.author?.portrait_url ?? null;
  });

  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const label = 'mb-1 block text-sm font-medium';
  const toDateInput = (iso?: string) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  const eur = (n?: number) => euros(n) ?? '—';
  const statusLabel: Record<string, string> = { draft: 'Brouillon', issued: 'Émis', paid: 'Payé' };
  const statusTone: Record<string, string> = { draft: 'bg-secondary text-muted-foreground', issued: 'bg-warning/15 text-warning', paid: 'bg-success/15 text-success' };

  // Droits groupés par année (année = début de période).
  const byYear = $derived.by(() => {
    const groups = new Map<number, { items: any[]; total: number }>();
    for (const s of data.statements ?? []) {
      const y = s.period_start ? new Date(s.period_start).getUTCFullYear() : 0;
      if (!groups.has(y)) groups.set(y, { items: [], total: 0 });
      const g = groups.get(y)!;
      g.items.push(s);
      g.total += s.total_due ?? 0;
    }
    return [...groups.entries()].sort((x, y) => y[0] - x[0]).map(([year, g]) => ({ year, ...g }));
  });
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
        <label class={label}>Naissance <input name="birth_date" type="date" value={toDateInput(a?.birth_date)} class={input} /></label>
        <label class={label}>Décès <input name="death_date" type="date" value={toDateInput(a?.death_date)} class={input} /></label>
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
  <!-- Droits d'auteur par année (admin) -->
  <div class="mt-8 max-w-3xl">
    <h3 class="mb-3 flex items-center gap-2 text-base font-semibold"><Coins size={17} /> Droits d'auteur par année</h3>
    {#if byYear.length}
      <div class="space-y-4">
        {#each byYear as g (g.year)}
          <div class="overflow-hidden rounded-lg border border-border bg-card">
            <div class="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
              <span class="font-semibold">{g.year || '—'}</span>
              <span class="text-sm text-muted-foreground">Total dû : <span class="font-semibold text-foreground">{eur(g.total)}</span></span>
            </div>
            <table class="w-full text-sm">
              <tbody class="divide-y divide-border">
                {#each g.items as s (s.id)}
                  <tr class="hover:bg-muted/30">
                    <td class="px-3 py-2 text-muted-foreground">{dateFr(s.period_start)} → {dateFr(s.period_end)}</td>
                    <td class="px-3 py-2"><span class="rounded px-2 py-0.5 text-xs {statusTone[s.status] ?? 'bg-secondary'}">{statusLabel[s.status] ?? s.status}</span></td>
                    <td class="px-3 py-2 text-right tabular-nums">{eur(s.total_due)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/each}
      </div>
      <a href="/admin/droits" class="mt-3 inline-block text-sm text-link hover:underline">Gérer les droits d'auteur →</a>
    {:else}
      <p class="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        Aucun relevé de droits pour cet auteur. Les relevés se génèrent dans <a href="/admin/droits" class="text-link hover:underline">Droits d'auteur</a>.
      </p>
    {/if}
  </div>

  <!-- Suppression -->
  <div class="mt-8 max-w-3xl border-t border-border pt-4">
    {#if hasBooks}
      <p class="flex items-center gap-2 text-sm text-muted-foreground"><Warning size={15} class="text-warning" /> Cet auteur a {a?.book_count} titre{a?.book_count > 1 ? 's' : ''} : suppression impossible.</p>
    {:else}
      <Button type="button" variant="ghost" size="sm" class="text-destructive hover:bg-destructive/10" onclick={() => (showDelete = true)}>
        <Trash size={15} /> Supprimer cet auteur
      </Button>
    {/if}
  </div>
{/if}

<!-- Modal de confirmation -->
{#if showDelete}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div class="w-full max-w-sm rounded-lg border border-border bg-background p-5 shadow-2xl">
      <h3 class="text-base font-semibold">Supprimer cet auteur ?</h3>
      <p class="mt-1 text-sm text-muted-foreground">« {a?.full_name} » sera définitivement supprimé. Cette action est irréversible.</p>
      <div class="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onclick={() => (showDelete = false)}>Annuler</Button>
        <form method="POST" action="?/delete" use:enhance>
          <Button type="submit" size="sm" class="bg-destructive text-destructive-foreground hover:bg-destructive/90"><Trash size={15} /> Supprimer</Button>
        </form>
      </div>
    </div>
  </div>
{/if}
