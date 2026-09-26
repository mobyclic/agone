<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { ROLE_LABEL } from '$lib/labels';
  import { ArrowLeft , FilePdf } from 'phosphor-svelte';

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
  <div class="flex flex-wrap items-center gap-2">
  <a href="/admin/droits/reddition/{String(s.id).replace('royalty_statement:', '')}/pdf" target="_blank" rel="noopener"
    class="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted">
    <FilePdf size={16} /> PDF
  </a>
  <form method="POST" action="?/status" use:enhance class="flex items-center gap-2">
    <select name="status" class="h-9 rounded-md border border-border bg-background px-2 text-sm">
      <option value="draft" selected={s.status === 'draft'}>Brouillon</option>
      <option value="issued" selected={s.status === 'issued'}>Émise</option>
      <option value="paid" selected={s.status === 'paid'}>Payée</option>
    </select>
    <Button type="submit" variant="outline" size="sm">Mettre à jour</Button>
  </form>
  </div>
</div>

<!-- Réserves du calcul : à lever avant d'émettre la reddition. -->
{#if s.warnings?.length}
  <div class="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-4">
    <p class="mb-1 text-sm font-semibold">À vérifier avant émission</p>
    <ul class="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
      {#each s.warnings as w (w)}<li>{w}</li>{/each}
    </ul>
  </div>
{/if}

<div class="overflow-x-auto rounded-lg border border-border bg-card">
  <table class="w-full text-sm">
    <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
      <tr>
        <th class="px-3 py-2 font-medium">Titre</th>
        <th class="px-3 py-2 font-medium">Rôle</th>
        <th class="px-3 py-2 text-right font-medium">Ventes nettes</th>
        <th class="px-3 py-2 text-right font-medium">Vendus</th>
        <th class="px-3 py-2 text-right font-medium">Retours</th>
        <th class="px-3 py-2 text-right font-medium" title="Retenue au titre des retours à venir, reprise l’exercice suivant">Provision</th>
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
          <td class="px-3 py-2 font-medium">
            {l.book_title}
            {#if l.kind === 'cession'}<span class="block text-xs font-normal text-link">{l.label}</span>{/if}
            {#if l.segment_start}
              <!-- Contrat qui ne couvre qu'une partie de l'exercice (avenant). -->
              <span class="block text-xs font-normal text-muted-foreground">
                du {new Date(l.segment_start).toLocaleDateString('fr-FR')} au {new Date(l.segment_end).toLocaleDateString('fr-FR')}
              </span>
            {/if}
          </td>
          <td class="px-3 py-2 text-muted-foreground">{ROLE_LABEL[l.role] ?? l.role}</td>
          <td class="px-3 py-2 text-right text-muted-foreground">{l.units_sold ?? '—'}</td>
          <td class="px-3 py-2 text-right text-muted-foreground">{l.units_returned ? `−${l.units_returned}` : '—'}</td>
          <td class="px-3 py-2 text-right text-muted-foreground">
            {l.units_provision ? `−${l.units_provision}` : '—'}{#if l.units_released}<span class="text-success"> +{l.units_released}</span>{/if}
          </td>
          <td class="px-3 py-2 text-right font-medium">{l.units}</td>
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
        <td class="px-3 py-2" colspan="8">Exercice</td>
        <td class="px-3 py-2 text-right">{eur(s.gross_total)}</td>
        <td class="px-3 py-2 text-right">−{eur(s.advance_applied)}</td>
        <td class="px-3 py-2 text-right">{eur(s.gross_total - s.advance_applied)}</td>
      </tr>
      {#if s.carry_in}
        <tr class="font-normal"><td class="px-3 py-2 text-muted-foreground" colspan="10">Report de l'exercice précédent : {eur(s.carry_in)}</td></tr>
      {/if}
      <tr>
        <td class="px-3 py-2" colspan="10">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span>Net dû : {eur(s.total_due)}</span>
            <span class="text-link">À payer : {eur(s.payable ?? s.total_due)}</span>
            {#if s.carry_out}
              <span class="text-sm font-normal text-muted-foreground">
                Reporté sur l'exercice suivant : {eur(s.carry_out)}{s.total_due >= 0 ? ' (sous le seuil de paiement)' : ' (retours supérieurs aux ventes)'}
              </span>
            {/if}
          </div>
        </td>
      </tr>
    </tfoot>
  </table>
</div>

<p class="mt-4 text-xs text-muted-foreground">Calcul par paliers sur le cumul des ventes, base contractuelle, à-valoir déduit. Export PDF à venir.</p>
