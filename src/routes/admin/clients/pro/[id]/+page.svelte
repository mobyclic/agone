<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, FloppyDisk, Trash, Plus, Download } from 'phosphor-svelte';
  import { euros } from '$lib/labels';

  let { data } = $props();
  const c = $derived(data.client);
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const label = 'mb-1 block text-sm font-medium';
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
</script>

<svelte:head><title>{c ? c.name : 'Nouveau professionnel'} · Clients · Admin</title></svelte:head>

<a href="/admin/clients?type=pro" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Clients professionnels</a>

<div class="mb-5 flex flex-wrap items-end justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">{c ? c.name : 'Nouveau client professionnel'}</h2>
    {#if c}<p class="text-sm text-muted-foreground">{data.kinds[c.kind] ?? c.kind}{c.city ? ` · ${c.city}` : ''}{c.created_at ? ` · fiche créée le ${dateFr(c.created_at)}` : ''}</p>{/if}
  </div>
  {#if c}<Button href="/admin/factures/nouvelle?client={c.id}"><Plus size={16} /> Nouvelle facture</Button>{/if}
</div>

<div class="grid gap-6 lg:grid-cols-[1fr_340px]">
  <form method="POST" action="?/save" use:enhance class="space-y-5">
    <section class="rounded-lg border border-border bg-card p-4">
      <h3 class="eyebrow mb-3">Identité</h3>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="sm:col-span-2"><span class={label}>Raison sociale *</span><input name="name" required value={c?.name ?? ''} class={input} /></label>
        <label><span class={label}>Type</span>
          <select name="kind" class={input}>{#each Object.entries(data.kinds) as [k, nom] (k)}<option value={k} selected={(c?.kind ?? 'librairie') === k}>{nom}</option>{/each}</select>
        </label>
        <label><span class={label}>SIRET</span><input name="siret" value={c?.siret ?? ''} class="{input} font-mono" /></label>
        <label><span class={label}>N° TVA intracommunautaire</span><input name="vat_number" value={c?.vat_number ?? ''} placeholder="FR…" class="{input} font-mono" /></label>
      </div>
    </section>
    <section class="rounded-lg border border-border bg-card p-4">
      <h3 class="eyebrow mb-3">Contact et adresse</h3>
      <div class="grid gap-3 sm:grid-cols-2">
        <label><span class={label}>Contact</span><input name="contact_name" value={c?.contact_name ?? ''} placeholder="personne à qui s’adresser" class={input} /></label>
        <label><span class={label}>Téléphone</span><input name="phone" value={c?.phone ?? ''} class={input} /></label>
        <label class="sm:col-span-2"><span class={label}>E-mail (envoi des factures)</span><input name="email" type="email" value={c?.email ?? ''} class={input} /></label>
        <label class="sm:col-span-2"><span class={label}>Adresse</span><input name="address_1" value={c?.address_1 ?? ''} class={input} /></label>
        <label class="sm:col-span-2"><span class={label}>Complément</span><input name="address_2" value={c?.address_2 ?? ''} placeholder="C/O, bâtiment, service…" class={input} /></label>
        <label><span class={label}>Code postal</span><input name="postcode" value={c?.postcode ?? ''} class={input} /></label>
        <label><span class={label}>Ville</span><input name="city" value={c?.city ?? ''} class={input} /></label>
        <label><span class={label}>Pays</span><input name="country" value={c?.country ?? 'France'} class={input} /></label>
      </div>
    </section>
    <section class="rounded-lg border border-border bg-card p-4">
      <span class={label}>Notes internes</span>
      <textarea name="notes" rows="3" class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">{c?.notes ?? ''}</textarea>
    </section>
    <div class="flex items-center gap-3">
      <Button type="submit" variant="brand"><FloppyDisk size={16} /> Enregistrer</Button>
    </div>
  </form>

  <div class="space-y-5">
    {#if c}
      <div class="overflow-hidden rounded-lg border border-border bg-card">
        <div class="border-b border-border px-4 py-3"><h3 class="text-sm font-semibold">Factures</h3></div>
        {#if data.factures.length}
          <table class="w-full text-sm">
            <tbody class="divide-y divide-border">
              {#each data.factures as f (f.id)}
                <tr class="hover:bg-muted/30">
                  <td class="px-4 py-2"><a href="/admin/factures/{f.id}" class="font-medium hover:text-link">{f.ref}</a>{#if f.kind === 'credit_note'}<span class="ml-1.5 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning">avoir</span>{/if}</td>
                  <td class="px-2 py-2 text-muted-foreground">{dateFr(f.issued_at)}</td>
                  <td class="px-2 py-2 text-right tabular-nums">{f.kind === 'credit_note' ? '−' : ''}{euros(f.total_ttc)}</td>
                  <td class="px-3 py-2 text-right"><a href="/admin/factures/{f.id}/pdf?dl=1" class="text-muted-foreground hover:text-foreground" aria-label="PDF"><Download size={15} /></a></td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <p class="px-4 py-6 text-sm text-muted-foreground">Aucune facture pour ce client.</p>
        {/if}
      </div>
      <!-- Un client facturé ne se supprime pas : ses factures le portent. -->
      {#if data.factures.length === 0}
        <form method="POST" action="?/delete" use:enhance onsubmit={(e: Event) => { if (!confirm(`Supprimer « ${c.name} » ?`)) e.preventDefault(); }}>
          <button type="submit" class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"><Trash size={13} /> Supprimer ce client</button>
        </form>
      {:else}
        <p class="text-xs text-muted-foreground">Ce client porte {data.factures.length} facture{data.factures.length > 1 ? 's' : ''} : il ne peut pas être supprimé.</p>
      {/if}
    {/if}
  </div>
</div>
