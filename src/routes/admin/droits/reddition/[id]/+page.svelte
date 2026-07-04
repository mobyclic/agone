<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { ROLE_LABEL } from '$lib/labels';
  import { ArrowLeft } from 'phosphor-svelte';

  let { data } = $props();
  const s = $derived(data.statement);
  const eur = (n: number) => `${(n ?? 0).toFixed(2).replace('.', ',')} €`;
  const fmtP = (a: string, b: string) => `${new Date(a).toLocaleDateString('fr-FR')} → ${new Date(b).toLocaleDateString('fr-FR')}`;
  const STATUS: Record<string, string> = { draft: 'Brouillon', issued: 'Émise', paid: 'Payée' };
</script>

<svelte:head><title>Reddition · {s.author_name}</title></svelte:head>

<a href="/admin/droits/reddition?start={String(s.period_start).slice(0,10)}&end={String(s.period_end).slice(0,10)}" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Reddition</a>

<div class="mb-5 flex flex-wrap items-start justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">{s.author_name}</h2>
    <p class="text-sm text-muted-foreground">Période : {fmtP(s.period_start, s.period_end)} · <span class="rounded bg-secondary px-2 py-0.5 text-xs">{STATUS[s.status] ?? s.status}</span></p>
  </div>
  <form method="POST" action="?/status" use:enhance class="flex items-center gap-2">
    <select name="status" class="h-9 rounded-md border border-border bg-background px-2 text-sm">
      <option value="draft" selected={s.status === 'draft'}>Brouillon</option>
      <option value="issued" selected={s.status === 'issued'}>Émise</option>
      <option value="paid" selected={s.status === 'paid'}>Payée</option>
    </select>
    <Button type="submit" variant="outline" size="sm">Mettre à jour</Button>
  </form>
</div>

<div class="overflow-x-auto rounded-lg border border-border bg-card">
  <table class="w-full text-sm">
    <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
      <tr>
        <th class="px-3 py-2 font-medium">Titre</th>
        <th class="px-3 py-2 font-medium">Rôle</th>
        <th class="px-3 py-2 text-right font-medium">Ventes nettes</th>
        <th class="px-3 py-2 text-right font-medium">Base unit.</th>
        <th class="px-3 py-2 text-right font-medium">Taux moy.</th>
        <th class="px-3 py-2 text-right font-medium">Brut</th>
        <th class="px-3 py-2 text-right font-medium">À-valoir</th>
        <th class="px-3 py-2 text-right font-medium">Net</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each s.lines as l (l.contract)}
        <tr>
          <td class="px-3 py-2 font-medium">{l.book_title}</td>
          <td class="px-3 py-2 text-muted-foreground">{ROLE_LABEL[l.role] ?? l.role}</td>
          <td class="px-3 py-2 text-right">{l.units}</td>
          <td class="px-3 py-2 text-right text-muted-foreground">{eur(l.base_amount)}</td>
          <td class="px-3 py-2 text-right text-muted-foreground">{l.rate?.toFixed(1)} %</td>
          <td class="px-3 py-2 text-right">{eur(l.gross)}</td>
          <td class="px-3 py-2 text-right text-muted-foreground">−{eur(l.advance_applied)}</td>
          <td class="px-3 py-2 text-right font-semibold">{eur(l.net)}</td>
        </tr>
      {/each}
    </tbody>
    <tfoot class="border-t border-border bg-muted/30 font-semibold">
      <tr>
        <td class="px-3 py-2" colspan="5">Total dû</td>
        <td class="px-3 py-2 text-right">{eur(s.gross_total)}</td>
        <td class="px-3 py-2 text-right">−{eur(s.advance_applied)}</td>
        <td class="px-3 py-2 text-right text-link">{eur(s.total_due)}</td>
      </tr>
    </tfoot>
  </table>
</div>

<p class="mt-4 text-xs text-muted-foreground">Calcul par paliers sur le cumul des ventes, base contractuelle, à-valoir déduit. Export PDF à venir.</p>
