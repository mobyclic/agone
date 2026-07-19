<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Plus } from 'phosphor-svelte';

  let { data } = $props();
  const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR') : null);
  const SCOPE: Record<string, string> = { all: 'Tout le catalogue', collection: 'Collections', book: 'Livres' };
  const valueLabel = (p: { type: string; value: number }) => (p.type === 'percent' ? `−${p.value} %` : `−${eur(p.value)}`);

  function windowLabel(p: { starts_at?: string; ends_at?: string }) {
    const s = dateFr(p.starts_at), e = dateFr(p.ends_at);
    if (s && e) return `${s} → ${e}`;
    if (e) return `jusqu'au ${e}`;
    if (s) return `dès le ${s}`;
    return 'permanent';
  }
</script>

<svelte:head><title>Codes promo · Admin Agone</title></svelte:head>

<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">Codes promo</h2>
    <p class="text-sm text-muted-foreground">{data.promos.length} code{data.promos.length > 1 ? 's' : ''}</p>
  </div>
  <Button href="/admin/promos/nouveau"><Plus size={16} /> Nouveau code</Button>
</div>

<div class="overflow-x-auto rounded-lg border border-border bg-card">
  <table class="w-full text-sm">
    <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
      <tr>
        <th class="px-3 py-2 font-medium">Code</th>
        <th class="px-3 py-2 font-medium">Remise</th>
        <th class="px-3 py-2 font-medium">Périmètre</th>
        <th class="px-3 py-2 font-medium">Validité</th>
        <th class="px-3 py-2 text-right font-medium">Utilisations</th>
        <th class="px-3 py-2 font-medium">État</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each data.promos as p (p.id)}
        <tr class="hover:bg-muted/30">
          <td class="px-3 py-2"><a href="/admin/promos/{p.id}" class="font-mono font-semibold hover:text-link">{p.code}</a></td>
          <td class="px-3 py-2 font-medium">{valueLabel(p)}</td>
          <td class="px-3 py-2 text-muted-foreground">{SCOPE[p.scope] ?? p.scope}</td>
          <td class="px-3 py-2 text-muted-foreground">{windowLabel(p)}</td>
          <td class="px-3 py-2 text-right tabular-nums text-muted-foreground">{p.used_count}{p.max_uses != null ? ` / ${p.max_uses}` : ''}</td>
          <td class="px-3 py-2">
            {#if p.active}<span class="rounded bg-success/15 px-2 py-0.5 text-xs text-success">Actif</span>
            {:else}<span class="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">Inactif</span>{/if}
          </td>
        </tr>
      {/each}
      {#if data.promos.length === 0}
        <tr><td colspan="6" class="px-3 py-10 text-center text-muted-foreground">Aucun code promo.</td></tr>
      {/if}
    </tbody>
  </table>
</div>
