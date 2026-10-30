<script lang="ts">
  /**
   * Réclames : bandeaux et fenêtres, programmés, en brouillon ou en ligne.
   * Un interrupteur publie / dépublie ; publier alors qu'une réclame du même type
   * s'afficherait en même temps demande confirmation (elle repasse en brouillon).
   * L'œil montre la réclame telle que sur le site ; la poubelle détaille avant de supprimer.
   */
  import { goto } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { Button } from '$lib/components/ui/button';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import PromoPopup from '$lib/components/PromoPopup.svelte';
  import SiteBanner from '$lib/components/SiteBanner.svelte';
  import { Plus, Megaphone, AppWindow, Trash, Eye } from 'phosphor-svelte';
  let { data, form } = $props();
  $effect(() => { if (form?.error) toast.error(form.error); });

  type Ligne = (typeof data.reclames)[number];

  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const periode = (r: { starts_at?: string; ends_at?: string }) => r.starts_at && r.ends_at ? `du ${dateFr(r.starts_at)} au ${dateFr(r.ends_at)}` : r.starts_at ? `à partir du ${dateFr(r.starts_at)}` : r.ends_at ? `jusqu'au ${dateFr(r.ends_at)}` : 'sans limite';
  const etat = (r: { en_ligne: boolean; status: string }) => (r.en_ligne ? 'En ligne' : r.status === 'published' ? 'Programmée' : 'Brouillon');
  const leType = (r: Ligne) => (r.kind === 'modal' ? 'la fenêtre' : 'le bandeau');

  /** Bascule en cours (affichage immédiat de l'interrupteur, avant le retour du serveur). */
  let enCours = $state<Record<string, boolean>>({});
  const soumettre = (id: string) => (document.getElementById(id) as HTMLFormElement | null)?.requestSubmit();

  let aPublier = $state<Ligne | null>(null);
  let confirmePublication = $state(false);
  let aSupprimer = $state<Ligne | null>(null);
  let confirmeSuppression = $state(false);
  let apercu = $state<Ligne | null>(null);

  function basculer(e: MouseEvent, r: Ligne) {
    // Mettre en ligne alors qu'une autre s'afficherait en même temps : on prévient d'abord.
    if (r.status !== 'published' && r.conflits.length) {
      e.preventDefault();
      aPublier = r;
      confirmePublication = true;
    }
  }
</script>

<svelte:head><title>Réclames · Admin Agone</title></svelte:head>

<div class="mb-5 flex flex-wrap items-end justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">Réclames</h2>
    <p class="text-sm text-muted-foreground">Un bandeau en bas de l'écran, ou une fenêtre à l'arrivée du visiteur ; programmées par dates. Un seul bandeau et une seule fenêtre à la fois.</p>
  </div>
  <div class="flex gap-2">
    <Button href="/admin/reclames/nouveau?kind=bandeau" variant="outline"><Megaphone size={16} /> Nouveau bandeau</Button>
    <Button href="/admin/reclames/nouveau?kind=modal" variant="brand"><Plus size={16} /> Nouvelle fenêtre</Button>
  </div>
</div>

<div class="overflow-x-auto rounded-lg border border-border bg-card">
  <table class="w-full text-sm">
    <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
      <tr>
        <th class="px-3 py-2 font-medium">Type</th>
        <th class="px-3 py-2 font-medium">Réclame</th>
        <th class="px-3 py-2 font-medium">Période</th>
        <th class="px-3 py-2 font-medium">État</th>
        <th class="px-3 py-2"></th>
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each data.reclames as r (r.id)}
        {@const publiee = enCours[r.id] ?? r.status === 'published'}
        <tr class="cursor-pointer hover:bg-muted/30" onclick={(e) => { if (!(e.target as HTMLElement).closest('a,button,form')) goto(`/admin/reclames/${r.id}`); }}>
          <td class="whitespace-nowrap px-3 py-2 text-muted-foreground"><span class="inline-flex items-center gap-1.5">{#if r.kind === 'modal'}<AppWindow size={15} />{:else}<Megaphone size={15} />{/if}{data.kinds[r.kind]}</span></td>
          <td class="px-3 py-2">
            <a href="/admin/reclames/{r.id}" class="flex items-center gap-3 font-medium hover:text-link">
              {#if r.image_url}<img src={r.image_url} alt="" class="h-10 w-14 rounded border border-border object-cover" />{/if}
              <span><span class="block">{r.title}</span>{#if r.message}<span class="block max-w-md truncate text-xs font-normal text-muted-foreground">{r.message}</span>{/if}</span>
            </a>
          </td>
          <td class="whitespace-nowrap px-3 py-2 text-muted-foreground">{periode(r)}</td>
          <td class="whitespace-nowrap px-3 py-2">
            <form id="statut-{r.id}" method="POST" action="?/statut" class="inline-flex items-center gap-2.5"
              use:enhance={() => { enCours[r.id] = r.status !== 'published'; return async ({ update }) => { await update(); delete enCours[r.id]; }; }}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="status" value={r.status === 'published' ? 'draft' : 'published'} />
              <button type="submit" role="switch" aria-checked={publiee} onclick={(e) => basculer(e, r)}
                title={publiee ? 'Publiée — cliquer pour repasser en brouillon' : 'Brouillon — cliquer pour mettre en ligne'}
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors {publiee ? 'bg-success' : 'bg-muted-foreground/30'}">
                <span class="inline-block size-4 rounded-full bg-white shadow transition-transform {publiee ? 'translate-x-[18px]' : 'translate-x-0.5'}"></span>
                <span class="sr-only">{publiee ? 'Publiée' : 'Brouillon'}</span>
              </button>
              {#if r.en_ligne}<span class="rounded bg-success/15 px-2 py-0.5 text-xs font-medium text-success">En ligne</span>
              {:else if r.status === 'published'}<span class="rounded bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning" title="Publiée, mais hors de ses dates">Programmée</span>
              {:else}<span class="rounded bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">Brouillon</span>{/if}
            </form>
          </td>
          <td class="whitespace-nowrap px-3 py-2 text-right">
            <span class="inline-flex items-center gap-1">
              <button type="button" onclick={() => (apercu = r)} class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Aperçu" title="Voir {leType(r)} comme sur le site"><Eye size={15} /></button>
              <form id="supprimer-{r.id}" method="POST" action="?/supprimer" use:enhance class="inline"><input type="hidden" name="id" value={r.id} />
                <button type="button" onclick={() => { aSupprimer = r; confirmeSuppression = true; }} class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive" aria-label="Supprimer" title="Supprimer"><Trash size={15} /></button></form>
            </span>
          </td>
        </tr>
      {/each}
      {#if data.reclames.length === 0}
        <tr><td colspan="5" class="px-3 py-10 text-center text-muted-foreground">Aucune réclame. Créez un bandeau ou une fenêtre.</td></tr>
      {/if}
    </tbody>
  </table>
</div>

<!-- Mise en ligne : une autre réclame du même type s'afficherait en même temps. -->
<ConfirmDialog bind:open={confirmePublication} titre="Mettre en ligne « {aPublier?.title ?? ''} » ?" confirmer="Mettre en ligne"
  onconfirm={() => { if (aPublier) soumettre(`statut-${aPublier.id}`); }}>
  {#if aPublier}
    <p>{aPublier.kind === 'modal' ? 'Une seule fenêtre s’affiche' : 'Un seul bandeau s’affiche'} à la fois.
      {aPublier.conflits.length > 1 ? 'Ces réclames passeront en brouillon :' : 'Celle-ci passera en brouillon :'}</p>
    <ul class="mt-3 space-y-1.5 rounded-md border border-border bg-muted/30 p-3 text-foreground">
      {#each aPublier.conflits as c (c.id)}
        <li class="flex items-baseline justify-between gap-3">
          <span class="font-medium">« {c.title} »</span>
          <span class="shrink-0 text-xs text-muted-foreground">{c.en_ligne ? 'en ligne' : 'programmée'} · {periode(c)}</span>
        </li>
      {/each}
    </ul>
  {/if}
</ConfirmDialog>

<!-- Suppression : on montre ce qui part, et l'alternative du brouillon. -->
<ConfirmDialog bind:open={confirmeSuppression} titre="Supprimer « {aSupprimer?.title ?? ''} » ?" confirmer="Supprimer définitivement" danger
  onconfirm={() => { if (aSupprimer) soumettre(`supprimer-${aSupprimer.id}`); }}>
  {#if aSupprimer}
    <div class="flex gap-3 rounded-md border border-border bg-muted/30 p-3 text-foreground">
      {#if aSupprimer.image_url}<img src={aSupprimer.image_url} alt="" class="h-16 w-20 shrink-0 rounded border border-border object-cover" />{/if}
      <dl class="grid min-w-0 grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt class="text-muted-foreground">Type</dt><dd>{data.kinds[aSupprimer.kind]}</dd>
        {#if aSupprimer.message}<dt class="text-muted-foreground">Texte</dt><dd class="line-clamp-3">{aSupprimer.message}</dd>{/if}
        {#if aSupprimer.url}<dt class="text-muted-foreground">Lien</dt><dd class="truncate">{aSupprimer.url}</dd>{/if}
        <dt class="text-muted-foreground">Période</dt><dd>{periode(aSupprimer)}</dd>
        <dt class="text-muted-foreground">État</dt><dd>{etat(aSupprimer)}</dd>
        <dt class="text-muted-foreground">Créée le</dt><dd>{dateFr(aSupprimer.created_at)}</dd>
      </dl>
    </div>
    {#if aSupprimer.en_ligne}
      <p class="mt-3 font-medium text-destructive">Elle est affichée sur le site en ce moment : elle disparaîtra aussitôt.</p>
    {/if}
    <p class="mt-3">La suppression est définitive{aSupprimer.image_url ? ' (l’image reste dans la médiathèque)' : ''}. Pour la retirer du site sans la perdre, repassez-la plutôt en brouillon.</p>
  {/if}
</ConfirmDialog>

<!-- Aperçu : la réclame telle que les visiteurs la verront. -->
{#if apercu?.kind === 'modal'}
  <PromoPopup apercu onclose={() => (apercu = null)}
    popup={{ title: apercu.title, body: apercu.message ?? '', cta_label: apercu.cta_label ?? '', cta_url: apercu.url ?? '', image_url: apercu.image_url ?? '', frequency: apercu.frequency, delay: 0, version: 'apercu' }} />
{:else if apercu}
  <SiteBanner apercu onclose={() => (apercu = null)} banner={{ active: true, message: apercu.message ?? apercu.title, url: apercu.url }} />
{/if}
