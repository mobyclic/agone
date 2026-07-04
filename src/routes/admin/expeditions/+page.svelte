<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { Truck, DownloadSimple, Warning, CheckCircle } from 'phosphor-svelte';
  let { data } = $props();
  const fmt = (s: string) => new Date(s).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  const STATUS: Record<string, string> = { staged: 'Dry-run (stagé)', uploaded: 'Transmis', failed: 'Échec' };
</script>

<svelte:head><title>Expéditions BL · Admin Agone</title></svelte:head>

<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
  <div><h2 class="text-xl font-bold">Expéditions Belles Lettres</h2><p class="text-sm text-muted-foreground">Export EDI des commandes payées vers le distributeur.</p></div>
  <form method="POST" action="?/generate" use:enhance>
    <Button type="submit"><Truck size={16} /> Générer l’export ({data.pending})</Button>
  </form>
</div>

{#if data.ftpEnabled}
  <p class="mb-4 flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success"><CheckCircle size={16} /> Envoi FTP <strong>ACTIVÉ</strong> (production) : les fichiers générés sont transmis aux Belles Lettres.</p>
{:else}
  <p class="mb-4 flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning"><Warning size={16} /> Envoi FTP <strong>DÉSACTIVÉ</strong> (dry-run) : les fichiers sont générés et consultables ici, mais <strong>ne sont pas transmis</strong>. Activez <code>BL_FTP_ENABLED=true</code> en production.</p>
{/if}

<p class="mb-4 text-sm text-muted-foreground">{data.pending} commande(s) payée(s) en attente d’export.</p>

<div class="overflow-x-auto rounded-lg border border-border bg-card">
  <table class="w-full text-sm">
    <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
      <tr><th class="px-3 py-2 font-medium">Fichier</th><th class="px-3 py-2 text-right font-medium">Commandes</th><th class="px-3 py-2 text-right font-medium">Livres</th><th class="px-3 py-2 font-medium">Statut</th><th class="px-3 py-2 font-medium">Date</th><th class="px-3 py-2"></th></tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each data.exports as e (e.id)}
        <tr class="hover:bg-muted/30">
          <td class="px-3 py-2 font-mono text-xs">{e.filename}</td>
          <td class="px-3 py-2 text-right">{e.order_count}</td>
          <td class="px-3 py-2 text-right">{e.book_count}</td>
          <td class="px-3 py-2"><span class="rounded bg-secondary px-2 py-0.5 text-xs">{STATUS[e.status] ?? e.status}</span></td>
          <td class="px-3 py-2 text-muted-foreground">{fmt(e.created_at)}</td>
          <td class="px-3 py-2 text-right"><a href="/admin/expeditions/{String(e.id).replace('bl_export:', '')}/download" class="inline-flex items-center gap-1 text-primary hover:underline"><DownloadSimple size={14} /> EDI</a></td>
        </tr>
      {/each}
      {#if data.exports.length === 0}<tr><td colspan="6" class="px-3 py-8 text-center text-muted-foreground">Aucun export généré.</td></tr>{/if}
    </tbody>
  </table>
</div>
