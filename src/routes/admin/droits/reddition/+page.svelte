<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, Coins } from 'phosphor-svelte';

  let { data, form } = $props();
  const eur = (n: number) => `${(n ?? 0).toFixed(2).replace('.', ',')} €`;
  const fmtP = (s: string, e: string) => `${new Date(s).toLocaleDateString('fr-FR')} → ${new Date(e).toLocaleDateString('fr-FR')}`;
  const STATUS: Record<string, string> = { draft: 'Brouillon', issued: 'Émise', paid: 'Payée' };
  const input = 'h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
</script>

<svelte:head><title>Reddition de comptes · Admin</title></svelte:head>

<a href="/admin/droits" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Droits d’auteur</a>
<h2 class="text-xl font-bold">Reddition de comptes</h2>
<p class="mb-6 text-sm text-muted-foreground">Génère les droits dus par auteur sur une période, à partir des contrats et des ventes.</p>

<div class="mb-6 rounded-lg border border-border bg-card p-5">
  <h3 class="eyebrow mb-3">Générer une reddition</h3>
  {#if form?.error}<p class="mb-3 rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}
  <form method="POST" action="?/generate" use:enhance class="flex flex-wrap items-end gap-3">
    <label class="text-xs font-medium text-muted-foreground">Début<br /><input name="period_start" type="date" required class="{input} mt-1" /></label>
    <label class="text-xs font-medium text-muted-foreground">Fin<br /><input name="period_end" type="date" required class="{input} mt-1" /></label>
    <Button type="submit"><Coins size={15} /> Générer</Button>
  </form>
  {#if data.periods.length}
    <div class="mt-4 flex flex-wrap gap-2">
      {#each data.periods as p (p.period_start)}
        <a href="/admin/droits/reddition?start={p.period_start.slice(0, 10)}&end={p.period_end.slice(0, 10)}"
          class="rounded-full border px-3 py-1 text-xs {data.start === p.period_start.slice(0, 10) ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted'}">
          {fmtP(p.period_start, p.period_end)} · {eur(p.total)}
        </a>
      {/each}
    </div>
  {/if}
</div>

{#if data.start && data.end}
  <div class="overflow-x-auto rounded-lg border border-border bg-card">
    <table class="w-full text-sm">
      <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
        <tr><th class="px-3 py-2 font-medium">Auteur</th><th class="px-3 py-2 font-medium">Statut</th><th class="px-3 py-2 text-right font-medium">Brut</th><th class="px-3 py-2 text-right font-medium">À-valoir</th><th class="px-3 py-2 text-right font-medium">Net dû</th></tr>
      </thead>
      <tbody class="divide-y divide-border">
        {#each data.statements as s (s.id)}
          <tr class="hover:bg-muted/30">
            <td class="px-3 py-2"><a href="/admin/droits/reddition/{String(s.id).replace('royalty_statement:', '')}" class="font-medium hover:text-primary">{s.author_name}</a></td>
            <td class="px-3 py-2"><span class="rounded bg-secondary px-2 py-0.5 text-xs">{STATUS[s.status] ?? s.status}</span></td>
            <td class="px-3 py-2 text-right text-muted-foreground">{eur(s.gross_total)}</td>
            <td class="px-3 py-2 text-right text-muted-foreground">−{eur(s.advance_applied)}</td>
            <td class="px-3 py-2 text-right font-semibold">{eur(s.total_due)}</td>
          </tr>
        {/each}
        {#if data.statements.length === 0}<tr><td colspan="5" class="px-3 py-8 text-center text-muted-foreground">Aucune reddition pour cette période.</td></tr>{/if}
      </tbody>
    </table>
  </div>
{/if}
