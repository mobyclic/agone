<script lang="ts">
  /** Réclames : bandeaux et fenêtres, programmés, en brouillon ou en ligne. */
  import { goto } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { Button } from '$lib/components/ui/button';
  import { Plus, Megaphone, AppWindow, Trash, Eye, EyeSlash } from 'phosphor-svelte';
  let { data, form } = $props();
  $effect(() => { if (form?.error) toast.error(form.error); });
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const periode = (r: { starts_at?: string; ends_at?: string }) => r.starts_at && r.ends_at ? `du ${dateFr(r.starts_at)} au ${dateFr(r.ends_at)}` : r.starts_at ? `à partir du ${dateFr(r.starts_at)}` : r.ends_at ? `jusqu'au ${dateFr(r.ends_at)}` : 'sans limite';
</script>

<svelte:head><title>Réclames · Admin Agone</title></svelte:head>

<div class="mb-5 flex flex-wrap items-end justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">Réclames</h2>
    <p class="text-sm text-muted-foreground">Un bandeau au-dessus du menu, ou une fenêtre à l'arrivée du visiteur ; programmées par dates. Pour chaque type, la réclame en ligne la plus récente s'affiche.</p>
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
            {#if r.en_ligne}<span class="rounded bg-success/15 px-2 py-0.5 text-xs font-medium text-success">En ligne</span>
            {:else if r.status === 'published'}<span class="rounded bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning" title="Publiée, mais hors de ses dates">Programmée</span>
            {:else}<span class="rounded bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">Brouillon</span>{/if}
          </td>
          <td class="whitespace-nowrap px-3 py-2 text-right">
            <span class="inline-flex items-center gap-2">
              <form method="POST" action="?/statut" use:enhance class="inline"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value={r.status === 'published' ? 'draft' : 'published'} />
                <button type="submit" class="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs hover:bg-muted">{#if r.status === 'published'}<EyeSlash size={13} /> Brouillon{:else}<Eye size={13} /> Mettre en ligne{/if}</button></form>
              <form method="POST" action="?/supprimer" use:enhance class="inline" onsubmit={(e) => { if (!confirm(`Supprimer « ${r.title} » ?`)) e.preventDefault(); }}><input type="hidden" name="id" value={r.id} />
                <button type="submit" class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive" aria-label="Supprimer" title="Supprimer"><Trash size={13} /></button></form>
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
