<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, FloppyDisk } from 'phosphor-svelte';
  import { ORDER_STATUS_LABEL, CHANNEL_LABEL, euros } from '$lib/labels';

  let { data, form } = $props();
  const c = $derived(data.client);

  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const label = 'mb-1 block text-sm font-medium';
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  const eur = (n?: number) => euros(n) ?? '—';
  const statusTone: Record<string, string> = {
    pending: 'bg-warning/15 text-warning', paid: 'bg-success/15 text-success',
    processing: 'bg-accent text-accent-foreground', sent_to_bl: 'bg-accent text-accent-foreground',
    completed: 'bg-success/15 text-success', cancelled: 'bg-muted text-muted-foreground',
    refunded: 'bg-muted text-muted-foreground', failed: 'bg-destructive/10 text-destructive'
  };
  const spent = $derived(c.orders.filter((o) => ['paid', 'processing', 'sent_to_bl', 'completed'].includes(o.status)).reduce((s, o) => s + (o.total ?? 0), 0));
</script>

<svelte:head><title>{c.full_name} · Clients · Admin</title></svelte:head>

<a href="/admin/utilisateurs" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
  <ArrowLeft size={16} /> Utilisateurs
</a>

<form method="POST" action="?/save" use:enhance class="max-w-3xl">
  <div class="mb-4">
    <h2 class="text-xl font-bold">{c.full_name}</h2>
    <p class="text-sm text-muted-foreground">
      Inscrit le {dateFr(c.created_at)}
      {#if c.legacy}· <span class="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase">Importé</span>{/if}
      {#if c.email}· {c.email_verified ? 'email vérifié' : 'email non vérifié'}{/if}
    </p>
  </div>

  {#if form?.error}<p class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.error}</p>{/if}

  <div class="grid gap-6 sm:grid-cols-[1fr_240px]">
    <div class="space-y-5">
      <div class="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
        <label class={label}>Prénom <input name="first_name" value={c.first_name} class={input} /></label>
        <label class={label}>Nom <input name="last_name" value={c.last_name} class={input} /></label>
        <label class="{label} sm:col-span-2">Email <input name="email" type="email" value={c.email ?? ''} class={input} /></label>
        <label class={label}>Téléphone <input name="phone" value={c.phone ?? ''} class={input} /></label>
        <label class={label}>Rôle
          <select name="role" class={input}>
            <option value="customer" selected={c.role === 'customer'}>Client</option>
            <option value="editor" selected={c.role === 'editor'}>Éditeur</option>
            <option value="admin" selected={c.role === 'admin'}>Admin</option>
            <option value="pending" selected={c.role === 'pending'}>En attente</option>
          </select>
        </label>
        <label class="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="accepts_newsletter" checked={c.accepts_newsletter} class="size-4 rounded border-border" /> Abonné à la lettre d’information
        </label>
      </div>

      <div class="rounded-lg border border-border bg-card p-4">
        <span class={label}>Notes internes</span>
        <textarea name="notes" rows="3" class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">{c.notes ?? ''}</textarea>
      </div>

      <!-- Commandes du client -->
      <div class="rounded-lg border border-border bg-card p-4">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="eyebrow">Commandes ({c.orders.length})</h3>
          <span class="text-sm text-muted-foreground">Total dépensé : <span class="font-semibold text-foreground">{eur(spent)}</span></span>
        </div>
        {#if c.orders.length}
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="text-left text-xs uppercase text-muted-foreground"><tr><th class="py-1 font-medium">N°</th><th class="py-1 font-medium">Statut</th><th class="py-1 font-medium">Type</th><th class="py-1 text-right font-medium">Total</th><th class="py-1 text-right font-medium">Date</th></tr></thead>
              <tbody class="divide-y divide-border">
                {#each c.orders as o (o.number)}
                  <tr>
                    <td class="py-1.5"><a href="/admin/commandes/{o.number}" class="font-medium hover:text-link">#{o.number}</a></td>
                    <td class="py-1.5"><span class="rounded px-2 py-0.5 text-xs {statusTone[o.status] ?? 'bg-secondary'}">{ORDER_STATUS_LABEL[o.status] ?? o.status}</span></td>
                    <td class="py-1.5 text-muted-foreground">{o.channel && o.channel !== 'web' ? (CHANNEL_LABEL[o.channel] ?? o.channel) : 'Web'}</td>
                    <td class="py-1.5 text-right tabular-nums">{eur(o.total)}</td>
                    <td class="py-1.5 text-right text-muted-foreground">{dateFr(o.created_at)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <p class="text-sm text-muted-foreground">Aucune commande.</p>
        {/if}
      </div>
    </div>

    <!-- Récap -->
    <div class="space-y-3">
      <div class="rounded-lg border border-border bg-card p-4">
        <div class="text-2xl font-bold tabular-nums">{c.orders.length}</div>
        <div class="text-xs text-muted-foreground">commande{c.orders.length > 1 ? 's' : ''}</div>
        <div class="mt-3 text-2xl font-bold tabular-nums">{eur(spent)}</div>
        <div class="text-xs text-muted-foreground">total dépensé</div>
      </div>
    </div>
  </div>

  <!-- Bouton flottant -->
  <div class="fixed bottom-6 right-6 z-40">
    <Button type="submit" variant="brand" class="shadow-2xl"><FloppyDisk size={16} /> Enregistrer</Button>
  </div>
</form>
