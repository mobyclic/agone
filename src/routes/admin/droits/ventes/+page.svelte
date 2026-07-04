<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, Trash, Plus } from 'phosphor-svelte';

  let { data, form } = $props();
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const lbl = 'mb-1 block text-xs font-medium text-muted-foreground';
  const fmtP = (s: string, e: string) => `${new Date(s).toLocaleDateString('fr-FR')} → ${new Date(e).toLocaleDateString('fr-FR')}`;
</script>

<svelte:head><title>Relevés de ventes · Admin</title></svelte:head>

<a href="/admin/droits" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Droits d’auteur</a>
<h2 class="text-xl font-bold">Relevés de ventes</h2>
<p class="mb-6 text-sm text-muted-foreground">Importez les ventes par canal et par période. Les redevances s’appuient dessus.</p>

<div class="grid gap-6 lg:grid-cols-[1fr_360px]">
  <!-- Liste -->
  <div>
    <div class="overflow-x-auto rounded-lg border border-border bg-card">
      <table class="w-full text-sm">
        <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr><th class="px-3 py-2 font-medium">Période</th><th class="px-3 py-2 font-medium">Canal</th><th class="px-3 py-2 text-right font-medium">Lignes</th><th class="px-3 py-2"></th></tr>
        </thead>
        <tbody class="divide-y divide-border">
          {#each data.reports as r (r.id)}
            <tr class="hover:bg-muted/30">
              <td class="px-3 py-2">{fmtP(r.period_start, r.period_end)}{#if r.label}<span class="ml-2 text-xs text-muted-foreground">{r.label}</span>{/if}</td>
              <td class="px-3 py-2">{r.channel_name}</td>
              <td class="px-3 py-2 text-right">{r.line_count}</td>
              <td class="px-3 py-2 text-right">
                <form method="POST" action="?/delete" use:enhance>
                  <input type="hidden" name="reportId" value={String(r.id).replace('sales_report:', '')} />
                  <button type="submit" class="text-muted-foreground hover:text-destructive" aria-label="Supprimer"
                    onclick={(e: Event) => { if (!confirm('Supprimer ce relevé et ses lignes ?')) e.preventDefault(); }}><Trash size={15} /></button>
                </form>
              </td>
            </tr>
          {/each}
          {#if data.reports.length === 0}<tr><td colspan="4" class="px-3 py-8 text-center text-muted-foreground">Aucun relevé.</td></tr>{/if}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Nouveau relevé -->
  <div class="rounded-lg border border-border bg-card p-5">
    <h3 class="eyebrow mb-3">Nouveau relevé</h3>
    {#if form?.error}<p class="mb-3 rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}
    <form method="POST" action="?/create" use:enhance class="space-y-3">
      <label class={lbl}>Canal
        <select name="channelId" class={input}>
          {#each data.channels as c (c.id)}<option value={String(c.id).replace('sales_channel:', '')}>{c.name}</option>{/each}
        </select>
      </label>
      <div class="grid grid-cols-2 gap-3">
        <label class={lbl}>Début <input name="period_start" type="date" required class={input} /></label>
        <label class={lbl}>Fin <input name="period_end" type="date" required class={input} /></label>
      </div>
      <label class={lbl}>Libellé <input name="label" placeholder="ex. S1 2026" class={input} /></label>
      <label class={lbl}>Lignes de ventes (collage CSV)
        <textarea name="lines" rows="7" placeholder="ISBN;vendus;retours;format;prix&#10;9782748906264;2500;12;paper;20" class="{input} h-auto py-2 font-mono text-xs"></textarea>
      </label>
      <p class="text-xs text-muted-foreground">Une ligne par titre. Colonnes : ISBN, unités vendues, retours (opt.), format (paper/ebook, opt.), prix (opt.). Le livre est retrouvé par ISBN.</p>
      <Button type="submit" class="w-full"><Plus size={15} /> Créer le relevé</Button>
    </form>
  </div>
</div>
